// SPDX-License-Identifier: MIT
pragma solidity =0.8.3;

import "./OBEX.sol";

contract OrderBook {
    struct Order {
        address maker;
        address tokenFromMaker;
        address tokenFromTaker;
        uint256 amountFromMaker;
        uint256 amountTokens;
        uint256 amountSold;
        bool isEnd;
    }

    OBEX public ex;

    constructor(address _exchange) {
        ex = OBEX(_exchange);
    }

    function myOrder(uint256 _page, uint256 _limit) external view returns (
        bytes32[] memory orderIds,
        address[] memory tokenFromMaker,
        address[] memory tokenFromTaker,
        uint256[] memory amountFromMaker,
        uint256[] memory amountTokens,
        uint256[] memory amountSold,
        bool[] memory isEnd
    ) {
        require(_limit > 1);
        uint256 length = ex.makerOrderLength(msg.sender);
        uint256 pages = length / _limit;
        uint256 residue = length % _limit;

        if(_page < pages) {     //ex 260 length. 2P60R  //// [[0P 100L -> 0~99 // 1P 100L -> 100~199]] // 2P 100L -> 200~259
            orderIds = new bytes32[](_limit);
            tokenFromMaker = new address[](_limit);
            tokenFromTaker = new address[](_limit);
            amountFromMaker = new uint256[](_limit);
            amountTokens = new uint256[](_limit);
            amountSold = new uint256[](_limit);
            isEnd = new bool[](_limit);

            for (uint256 i = _page * _limit; i < (_page + 1) * _limit; i++) { //from 0*100 before 1*100 : 0~99 && 100~199 && 200~299
                orderIds[i] = ex._ordersByMaker(msg.sender)[i];
                (
                    , 
                    tokenFromMaker[i], 
                    tokenFromTaker[i], 
                    amountFromMaker[i], 
                    amountTokens[i], 
                    amountSold[i], 
                    isEnd[i]
                ) = ex.orders(orderIds[i]);
            }
        } else {    //260 length. 2P60R  //// 0P 100L -> 0~99 // 1P 100L -> 100~199 // [[[2P 100L -> 200~259]]] -> 0~59
            orderIds = new bytes32[](residue);
            tokenFromMaker = new address[](residue);
            tokenFromTaker = new address[](residue);
            amountFromMaker = new uint256[](residue);
            amountTokens = new uint256[](residue);
            amountSold = new uint256[](residue);
            isEnd = new bool[](residue);

            if(length > _page * _limit) {
                for (uint256 i = 0; i < residue; i++) { //from 2*100 to 2*100+59 : 0~59
                    orderIds[i] = ex._ordersByMaker(msg.sender)[(_page * _limit) + i];
                    (
                        , 
                        tokenFromMaker[i], 
                        tokenFromTaker[i], 
                        amountFromMaker[i], 
                        amountTokens[i], 
                        amountSold[i], 
                        isEnd[i]
                    ) = ex.orders(orderIds[i]);
                }
            }
        }
    }

    //just for example.
    function orderBook(address _tokenA, address _tokenB, uint256 _page, uint256 _limit) external view returns (
        bytes32[] memory orderIds,
        address[] memory maker,
        uint256[] memory amountFromMaker,
        uint256[] memory amountTokens,
        uint256[] memory amountSold,
        bool[] memory isEnd
    ) {
        require(_limit > 1);
        uint256 length = ex.tokensOrderLength(_tokenA, _tokenB);
        uint256 pages = length / _limit;
        uint256 residue = length % _limit;

        if(_page < pages) {     //ex 260 length. 2P60R  //// [[0P 100L -> 0~99 // 1P 100L -> 100~199]] // 2P 100L -> 200~259
            orderIds = new bytes32[](_limit);
            maker = new address[](_limit);
            amountFromMaker = new uint256[](_limit);
            amountTokens = new uint256[](_limit);
            amountSold = new uint256[](_limit);
            isEnd = new bool[](_limit);

            for (uint256 i = _page * _limit; i < (_page + 1) * _limit; i++) { //from 0*100 before 1*100 : 0~99 && 100~199 && 200~299
                orderIds[i] = ex._ordersByTokens(_tokenA, _tokenB)[i];
                (
                    maker[i], 
                    , 
                    , 
                    amountFromMaker[i], 
                    amountTokens[i], 
                    amountSold[i], 
                    isEnd[i]
                ) = ex.orders(orderIds[i]);
            }
        } else {    //260 length. 2P60R  //// 0P 100L -> 0~99 // 1P 100L -> 100~199 // [[[2P 100L -> 200~259]]]
            orderIds = new bytes32[](residue);
            maker = new address[](residue);
            amountFromMaker = new uint256[](residue);
            amountTokens = new uint256[](residue);
            amountSold = new uint256[](residue);
            isEnd = new bool[](residue);

            if(length > _page * _limit) {
                for (uint256 i = 0; i < residue; i++) { //from 2*100 to 2*100+59 : 200~259
                    orderIds[i] = ex._ordersByTokens(_tokenA, _tokenB)[(_page * _limit) + i];
                    (
                        maker[i], 
                        , 
                        , 
                        amountFromMaker[i], 
                        amountTokens[i], 
                        amountSold[i], 
                        isEnd[i]
                    ) = ex.orders(orderIds[i]);
                }
            }
        }
    }
}