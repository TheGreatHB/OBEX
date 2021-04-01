// SPDX-License-Identifier: MIT
pragma solidity =0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract OBEX is Ownable, ReentrancyGuard{
    struct Order {
        address maker;
        address tokenFromMaker;
        address tokenFromTaker;
        uint256 amountFromMaker;
        uint256 amountTokens;
        uint256 amountSold;
        bool isEnd;
    }

    mapping(address => bytes32[]) public ordersByMaker;
    mapping(address => mapping (address => bytes32[])) public ordersByTokens;
    mapping(bytes32 => Order) public orders;
    mapping(address => uint256) public nonces;

	address public constant ETH_ADDRESS = address(0);

    address public feeAddress;
    uint16 public feePercent;
    uint256 public feeETHAmounts;
    mapping (address => uint256) public feeTokenAmounts;

    event Make(
        bytes32 indexed orderId, 
        address indexed maker,
        address tokenFromMaker, 
        address tokenFromTaker,
        uint256 amountFromMaker,
        uint256 amountTokens
    );

    event Take(
        bytes32 indexed orderId,
        address indexed taker, 
        address tokenFromMaker, 
        address tokenFromTaker, 
        uint256 amountFromMaker, 
        uint256 amountThisTakerGet, 
        uint256 amountSold,
        bool isEnd
    );

    event Cancel(bytes32 indexed orderId);

    constructor(uint16 _feePercent) {
        require(_feePercent <= 10000, "input value is more than 100%");
        feeAddress = msg.sender;
        feePercent = _feePercent;
    }

    //view fxns
    function _ordersByMaker(address _maker) external view returns (bytes32[] memory) {
        return ordersByMaker[_maker];
    }

    function _ordersByTokens(address _tokenA, address _tokenB) external view returns (bytes32[] memory) {
        return ordersByTokens[_tokenA][_tokenB];
    }

    function makerOrderLength(address _maker) public view returns (uint256) {
        return ordersByMaker[_maker].length;
    }
    
    function tokensOrderLength(address _tokenFromMaker, address _tokenFromTaker) public view returns (uint256) {
        return ordersByTokens[_tokenFromMaker][_tokenFromTaker].length;
    }


    //make order fxns
    function makeOrderFromETHToTokens(address _tokenFromTaker, uint256 _amountTokens) external payable {
        require(_tokenFromTaker != address(0), "Wrong Token");
        require(msg.value != 0, "zero ETH");
        _makeOrder(address(0), _tokenFromTaker, msg.value, _amountTokens);
    }

    function makeOrderFromTokensToETH(address _tokenFromMaker, uint256 _amountFromMaker, uint256 _amountETH) external {
        require(_tokenFromMaker != address(0), "Wrong Token");
        require(_amountFromMaker != 0, "zero Tokens");
        _makeOrder(_tokenFromMaker, address(0), _amountFromMaker, _amountETH);
        IERC20(_tokenFromMaker).transferFrom(msg.sender, address(this), _amountFromMaker);
    }

    function _makeOrder(address _tokenFromMaker, address _tokenFromTaker, uint256 _amountFromMaker, uint256 _amountTokens) internal {
        bytes32 hash = _hash(msg.sender, _tokenFromMaker, _tokenFromTaker);
        orders[hash] = Order(msg.sender, _tokenFromMaker, _tokenFromTaker, _amountFromMaker, _amountTokens, 0, false);
        ordersByMaker[msg.sender].push(hash);
        ordersByTokens[_tokenFromMaker][_tokenFromTaker].push(hash);
        emit Make(hash, msg.sender, _tokenFromMaker, _tokenFromTaker, _amountFromMaker, _amountTokens);
    }

	function _hash(address _maker, address _token0, address _token1) internal returns (bytes32) {
        return keccak256(abi.encodePacked(_maker, _token0, _token1, nonces[_maker]++));
	}


    //take order fxn
    function takeOrder(bytes32 _orderId, uint256 _amountTakerPayTokens, uint256 _amountTakerRcvWOFee) external payable nonReentrant {
        Order storage o = orders[_orderId];
        address maker = o.maker;
        address token0 = o.tokenFromMaker;
        address token1 = o.tokenFromTaker;
        uint256 amount0 = o.amountFromMaker;
        uint256 amount1 = o.amountTokens;
        uint256 sold = o.amountSold;
        bool isEnd = o.isEnd;

        require(maker != msg.sender, "Your order");
        require(isEnd == false, "It's over");
        require(_amountTakerRcvWOFee <= (amount0 - sold), "Buy less amount");
        
        uint256 amountSold = sold + _amountTakerRcvWOFee;
        o.amountSold = amountSold;

        if((amountSold) == amount0) {
            isEnd = true;
            o.isEnd = true;
        }

        if(token0 == address(0)) {
            require(msg.value == 0, "Don't need to pay ETH");
            require(_amountTakerPayTokens != 0, "Have to pay Tokens");
            require((_amountTakerPayTokens * amount0) >= (amount1 * _amountTakerRcvWOFee), "less price");

            uint256 _feeToken = _amountTakerPayTokens * feePercent / 10000;
            feeTokenAmounts[token1] += _feeToken;
            IERC20(token1).transferFrom(msg.sender, address(this), _amountTakerPayTokens);
            IERC20(token1).transfer(maker, _amountTakerPayTokens - _feeToken);
            
            uint256 _feeETH = _amountTakerRcvWOFee * feePercent / 10000;
            feeETHAmounts += _feeETH;
            payable(msg.sender).transfer(_amountTakerRcvWOFee - _feeETH);
        } else {
            require(_amountTakerPayTokens == 0, "Don't need to pay Tokens");
            require(msg.value != 0, "Have to pay ETH");
            require((msg.value * amount0) >= (amount1 * _amountTakerRcvWOFee), "less price");

            uint256 _feeETH = msg.value * feePercent / 10000;
            feeETHAmounts += _feeETH;
            payable(maker).transfer(msg.value - _feeETH);

            uint256 _feeToken = _amountTakerRcvWOFee * feePercent / 10000;
            feeTokenAmounts[token0] += _feeToken;
            IERC20(token0).transfer(msg.sender, _amountTakerRcvWOFee - _feeToken);
        }

        emit Take(_orderId, msg.sender, token0, token1, amount0, _amountTakerRcvWOFee, amountSold, isEnd);
    }



    function cancel(bytes32 _orderId) external nonReentrant {
        Order storage o = orders[_orderId];
        address maker = o.maker;
        address token0 = o.tokenFromMaker;
        uint256 amount0 = o.amountFromMaker;
        uint256 sold = o.amountSold;
        bool isEnd = o.isEnd;

        require(maker == msg.sender, "Access denied");
        require(!isEnd, "It's end");

        o.isEnd = true;

        if (token0 == address(0)) {
            payable(msg.sender).transfer(amount0 - sold);
        } else {
            IERC20(token0).transfer(msg.sender, amount0 - sold);
        }
        emit Cancel(_orderId);
    }


    function setFeeAddress(address _feeAddress) external onlyOwner {
        feeAddress = _feeAddress;
    }

    function updateFeePercent(uint16 _percent) external onlyOwner {
        require(_percent <= 10000, "input value is more than 100%");
        feePercent = _percent;
    }

    function withdrawFee(address _token, uint256 amount) external nonReentrant {
        require(msg.sender == feeAddress, "Access denied");
        if (_token == address(0)) {
            if(amount <= feeETHAmounts) { 
                feeETHAmounts -= amount;
                payable(msg.sender).transfer(amount);
            } else {
                uint256 fee = feeETHAmounts;
                feeETHAmounts = 0;
                payable(msg.sender).transfer(fee);
            }
        } else {
            if(amount <= feeTokenAmounts[_token]) {
                feeTokenAmounts[_token] -= amount;
                IERC20(_token).transfer(feeAddress, amount);
            } else {
                uint256 fee = feeTokenAmounts[_token];
                feeTokenAmounts[_token] = 0;
                IERC20(_token).transfer(feeAddress, fee);
            }
        }
    }
   
}