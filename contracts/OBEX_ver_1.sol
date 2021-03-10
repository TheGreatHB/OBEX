pragma solidity =0.6.12;

import "./IERC20.sol";
import "./SafeMath.sol";

contract OBEX {
    using SafeMath for uint256;

    struct Order {
        uint orderId;
        address payable maker;
        address tokenSell;
        address tokenBuy;
        uint amountSell;
        uint amountBuy;
        uint amountFilled;
    }

    Order[] private orders;
    address payable owner;

    event Make(uint orderId, address maker, address tokenSellByMaker, address tokenBuyByMaker, uint amountSell, uint amountBuy);
    event Take(uint orderId, address taker, address tokenSellByTaker, address tokenBuyByTaker, uint amountSell, uint amountBuy, uint amountFilled);
    event Cancel(uint orderId);

    constructor() public {
        owner == msg.sender;
    }

    function makeOrderETHToTokens(address _token, uint _amountSell, uint _amountBuy) public payable {
        require(_token != address(0), "wrong token address");
        uint orderId = orders.length;
        orders.push(Order(orderId, msg.sender, address(0), _token, _amountSell, _amountBuy, 0));
        emit Make(orderId, msg.sender, address(0), _token, _amountSell, _amountBuy);

    }

    function makeOrderTokensToETH(address _token, uint _amountSell, uint _amountBuy) public {
        require(_token != address(0), "wrong token address");
        uint orderId = orders.length;
        orders.push(Order(orderId, msg.sender, _token, address(0), _amountSell, _amountBuy, 0));
        IERC20(_token).transferFrom(msg.sender, address(this), _amountSell);
        emit Make(orderId, msg.sender, _token, address(0), _amountSell, _amountBuy);

    }

    function takeOrderETHToTokens(uint _orderId, uint _amountRcv) public payable {
        require(_orderId < orders.length, "wrong order id");
        Order storage o = orders[_orderId];
        address token = o.tokenSell;
        require(o.amountSell.sub(o.amountFilled) >= _amountRcv, "you can't buy more than the amount of the token remaining.");
        require(o.amountSell.mul(msg.value) >= _amountRcv.mul(o.amountBuy), "you have to pay at least the price the seller want.");

        //0.5% fee
        //ETH transfer
        o.maker.transfer(msg.value.mul(995)/(1000));
        owner.transfer(msg.value.sub(msg.value.mul(995)/(1000)));

        //token transfer
        IERC20(token).transfer(msg.sender, _amountRcv.mul(995)/(1000));
        IERC20(token).transfer(owner, _amountRcv.sub(_amountRcv.mul(995)/(1000)));

        o.amountFilled = o.amountFilled.add(_amountRcv);

        emit Take(_orderId, msg.sender, address(0), token, msg.value, _amountRcv, o.amountFilled);
    }

    function takeOrderTokensToETH(uint _orderId, uint _amountPay, uint _amountRcv) public {
        require(_orderId < orders.length, "wrong order id");
        Order storage o = orders[_orderId];
        address token = o.tokenBuy;
        require(o.amountSell.sub(o.amountFilled) >= _amountRcv, "you can't buy more than the amount of the token remaining.");
        require(o.amountSell.mul(_amountPay) >= _amountRcv.mul(o.amountBuy), "you have to pay at least the price the seller want.");

        //5% fee
        //ETH transfer
        msg.sender.transfer(_amountRcv.mul(995)/(1000));
        owner.transfer(_amountRcv.sub(_amountRcv.mul(995)/(1000)));

        //token transfer
        IERC20(token).transferFrom(msg.sender, o.maker, _amountPay.mul(995)/(1000));
        IERC20(token).transferFrom(msg.sender, owner, _amountPay.sub(_amountPay.mul(995)/(1000)));

        o.amountFilled = o.amountFilled.add(_amountRcv);
        emit Take(_orderId, msg.sender, token, address(0), _amountPay, _amountRcv, o.amountFilled);
    }

    function cancel(uint _orderId) public {
        require(_orderId < orders.length, "nonexistent order");
        Order storage o = orders[_orderId];
        require(o.maker == msg.sender, "You can only cancel your order.");
        if (o.tokenSell == address(0)) {
            msg.sender.transfer(o.amountSell.sub(o.amountFilled));
        } else {
            IERC20(o.tokenSell).transfer(msg.sender, o.amountSell.sub(o.amountFilled));
        }
        emit Cancel(_orderId);
    }

    function myOrder(uint _page, uint _limit) public view returns (
        uint[] memory orderId,
        address[] memory tokenSell,
        address[] memory tokenBuy,
        uint[] memory amountSell,
        uint[] memory amountBuy,
        uint[] memory amountFilled
    ) {
        uint length;

        for (uint i = _page.mul(_limit); i < (_page + 1).mul(_limit); i++) {
            Order storage o = orders[i];
            if (o.maker == msg.sender) {
                length += 1;
            }
        }

        orderId = new uint[](length);
        tokenSell = new address[](length);
        tokenBuy = new address[](length);
        amountSell = new uint[](length);
        amountBuy = new uint[](length);
        amountFilled = new uint[](length);

        uint count;
        for (uint i = _page.mul(_limit); i < (_page + 1).mul(_limit); i++) {
            Order storage o = orders[i];
            if (o.maker == msg.sender) {
                orderId[count] = o.orderId;
                tokenSell[count] = o.tokenSell;
                tokenBuy[count] = o.tokenBuy;
                amountSell[count] = o.amountSell;
                amountBuy[count] = o.amountBuy;
                amountFilled[count++] = o.amountFilled;
            }
        }
    }                            //1. ABIencoder 써서 Order[] 반환.    2. length=_limit 해서. 미리 배열 만들고, 첫번째 for문에서 count ++ 하면서 입력. 다 끝나면 배열 길이를 count 로 변경.

    function orderBook(address _tokenA, address _tokenB, uint _page, uint _limit) public view returns (
        uint[] memory orderId,
        address[] memory maker,
        uint[] memory amountSell,
        uint[] memory amountBuy,
        uint[] memory amountFilled
    ) {
        uint length;

        for (uint i = _page.mul(_limit); i < (_page + 1).mul(_limit); i++) {
            Order storage o = orders[i];
            if (o.tokenSell == _tokenA && o.tokenBuy == _tokenB) {
                length += 1;
            }
        }

        orderId = new uint[](length);
        maker = new address[](length);
        amountSell = new uint[](length);
        amountBuy = new uint[](length);
        amountFilled = new uint[](length);

        uint count;
        for (uint i = _page.mul(_limit); i < (_page + 1).mul(_limit); i++) {
            Order storage o = orders[i];
            if (o.tokenSell == _tokenA && o.tokenBuy == _tokenB) {
                orderId[count] = o.orderId;
                maker[count] = o.maker;
                amountSell[count] = o.amountSell;
                amountBuy[count] = o.amountBuy;
                amountFilled[count++] = o.amountFilled;
            }
        }
    }


    function transferTokens(address _token, uint amount) public {
        require(owner == msg.sender, "this function is only for the owner.");
        if (_token == address(0)) {
            msg.sender.transfer(amount);
        } else {
            IERC20(_token).transfer(msg.sender, amount);
        }
    }
}