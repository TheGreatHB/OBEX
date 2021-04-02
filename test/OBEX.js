const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OBEX contract", function () {

    let OBEX, ex, token, Token, owner, addr1, addr2, addr3;

    async function _hash(maker, token0, token1, nonce) {
        return await ethers.utils.solidityKeccak256(
            ["address","address","address","uint256"],
            [maker,token0,token1,nonce]
        );
    }

    before(async function () {
        OBEX = await ethers.getContractFactory("OBEX");
        Token = await ethers.getContractFactory("Token");
        ex = await OBEX.deploy(500);
        token = await Token.deploy();

        [owner, addr1, addr2, addr3] = await ethers.getSigners();
        ethAdd = await ethers.constants.AddressZero;
        feeAdd = await ex.feeAddress();

        await expect(OBEX.connect(owner).deploy(11000))
            .to.be.revertedWith("input value is more than 100%"); 
    });
  
    beforeEach(async function () {
        ex = await OBEX.deploy(500);

        await token.mint(owner.address, 1000000);
        await token.mint(addr1.address, 2000000);
        await token.mint(addr2.address, 3000000);
        await token.mint(addr3.address, 4000000);

        await token.connect(owner).approve(ex.address, 100000000);
        await token.connect(addr1).approve(ex.address, 100000000);
        await token.connect(addr2).approve(ex.address, 100000000);
        await token.connect(addr3).approve(ex.address, 100000000);
    });
  
    describe("Deployment", function () {
        it("Check token balances", async function () {
            expect(await token.balanceOf(owner.address)).to.equal(1000000);
            expect(await token.balanceOf(addr1.address)).to.equal(2000000);
            expect(await token.balanceOf(addr2.address)).to.equal(3000000);
            expect(await token.balanceOf(addr3.address)).to.equal(4000000);
        });
      
        it("variables and functions about fee", async function () {
            expect(await ex.feeAddress()).to.equal(owner.address);
            expect(await ex.feePercent()).to.equal(500);
      
            await expect(ex.connect(addr1).setFeeAddress(addr1.address))
                .to.be.revertedWith("Ownable: caller is not the owner");

            await expect(ex.connect(addr1).updateFeePercent(300))
                .to.be.revertedWith("Ownable: caller is not the owner");

            await ex.setFeeAddress(addr1.address);
            expect(await ex.feeAddress()).to.equal(addr1.address);

            await ex.updateFeePercent(300);
            expect(await ex.feePercent()).to.equal(300);

            await expect(ex.updateFeePercent(10300))
                .to.be.revertedWith("input value is more than 100%");
        });
    });

    describe("Make/Take/Cancel", function () {
        it("FromETHtoERC20", async function () {
            await expect(ex.makeOrderFromETHToTokens(ethAdd, 1000, {value : 1000}))
                .to.be.revertedWith("Wrong Token");

            await expect(ex.makeOrderFromETHToTokens(token.address, 1000))
                .to.be.revertedWith("zero ETH");

            expect(await ex.makerOrderLength(addr1.address)).to.equal(0);
            expect(await ex.tokensOrderLength(ethAdd, token.address)).to.equal(0);

            await expect(() => ex.connect(addr1).makeOrderFromETHToTokens(
                token.address, 1000, {value:1000}))
                .to.changeEtherBalances([addr1,ex],[-1000,1000]);

            await ex.connect(addr1).makeOrderFromETHToTokens(token.address, 2000, {value:2000});
            await ex.connect(addr2).makeOrderFromETHToTokens(token.address, 3000, {value:3000});

            const hash0 = await _hash(addr1.address,ethAdd,token.address,await ex.nonces(addr1.address));
            await expect(ex.connect(addr1).makeOrderFromETHToTokens(
                token.address, 4000, {value:4000})).to.emit(ex, "Make")
                .withArgs(hash0, addr1.address, ethAdd, token.address, 4000, 4000);

            const hash1 = await _hash(addr1.address,ethAdd,token.address,await ex.nonces(addr1.address));
            await ex.connect(addr1).makeOrderFromETHToTokens(token.address, 5000, {value:5000});

            expect(await ex.makerOrderLength(addr1.address)).to.equal(4);
            expect(await ex.tokensOrderLength(ethAdd, token.address)).to.equal(5);

            await expect(ex.connect(addr1).takeOrder(hash0, 3000, 3000))
                .to.be.revertedWith("Your order");
            await expect(ex.connect(addr2).takeOrder(hash0, 3000, 6000))
                .to.be.revertedWith("Buy less amount");
            await expect(ex.connect(addr2).takeOrder(hash0, 3000, 3000,{value:1000}))
                .to.be.revertedWith("Don't need to pay ETH");
            await expect(ex.connect(addr2).takeOrder(hash0, 0, 3000))
                .to.be.revertedWith("Have to pay Tokens");
            await expect(ex.connect(addr2).takeOrder(hash0, 3000, 3001))
                .to.be.revertedWith("less price");
            
            await expect(ex.connect(addr2).takeOrder(hash0, 4000, 4000)).to.emit(ex, "Take")
                .withArgs(hash0,addr2.address,ethAdd,token.address,4000,4000,4000,true);

            await expect(ex.connect(addr3).takeOrder(hash0, 3000, 3000)).to.be.revertedWith("It's over");

            await expect(ex.connect(addr3).takeOrder(hash1, 3000, 1000)).to.emit(ex, "Take")
                .withArgs(hash1,addr3.address,ethAdd,token.address,5000,1000,1000,false);

            const addr1TokenBalance0 = await token.balanceOf(addr1.address);
            const addr3TokenBalance0 = await token.balanceOf(addr3.address);
            const feeTokenBalance0 = await ex.feeTokenAmounts(token.address);
            const feeETHBalance0 = await ex.feeETHAmounts();

            await expect(() => ex.connect(addr3).takeOrder(hash1, 3000, 2000))
                .to.changeEtherBalance(addr3, 1900);
            
            const addr1TokenBalance1 = await token.balanceOf(addr1.address);
            const addr3TokenBalance1 = await token.balanceOf(addr3.address);
            const feeTokenBalance1 = await ex.feeTokenAmounts(token.address);
            const feeETHBalance1 = await ex.feeETHAmounts();

            await expect(addr1TokenBalance1 - addr1TokenBalance0).to.equal(2850);
            await expect(addr3TokenBalance1 - addr3TokenBalance0).to.equal(-3000);
            await expect(feeTokenBalance1 - feeTokenBalance0).to.equal(150);
            await expect(feeETHBalance1 - feeETHBalance0).to.equal(100);
            
            await expect(ex.connect(addr2).cancel(hash1)).to.be.revertedWith("Access denied");

            await expect(ex.connect(addr1).cancel(hash1)).to.emit(ex, "Cancel").withArgs(hash1);
            
            await expect(ex.connect(addr1).cancel(hash1)).to.be.revertedWith("It's end");
            await expect(ex.connect(addr3).takeOrder(hash1, 3000, 2000)).to.be.revertedWith("It's over");

            const hash2 = await _hash(addr3.address,ethAdd,token.address,await ex.nonces(addr3.address));
            await ex.connect(addr3).makeOrderFromETHToTokens(token.address, 2000, {value:5000});
            await ex.connect(addr2).takeOrder(hash2, 4000, 4500);

            await expect(() => ex.connect(addr3).cancel(hash2)).to.changeEtherBalance(addr3, 500);
        });

        it("FromERC20toETH", async function () {
            await expect(ex.makeOrderFromTokensToETH(ethAdd, 1000, 1000)).to.be.revertedWith("Wrong Token");

            await expect(ex.makeOrderFromTokensToETH(token.address, 0, 1000)).to.be.revertedWith("zero Tokens");

            expect(await ex.makerOrderLength(addr1.address)).to.equal(0);
            expect(await ex.tokensOrderLength(token.address, ethAdd)).to.equal(0);

            await expect(() => ex.connect(addr1).makeOrderFromTokensToETH(token.address, 1000, 1000))
                .to.changeTokenBalances(token, [addr1,ex],[-1000,1000]);

            await ex.connect(addr1).makeOrderFromTokensToETH(token.address, 2000, 2000);
            await ex.connect(addr2).makeOrderFromTokensToETH(token.address, 3000, 3000);

            const hash0 = await _hash(addr1.address,token.address,ethAdd,await ex.nonces(addr1.address));
            await expect(ex.connect(addr1).makeOrderFromTokensToETH(token.address, 4000, 4000)).to.emit(ex, "Make")
                .withArgs(hash0, addr1.address, token.address, ethAdd, 4000, 4000);

            const hash1 = await _hash(addr1.address,token.address,ethAdd,await ex.nonces(addr1.address));
            await ex.connect(addr1).makeOrderFromTokensToETH(token.address, 5000, 5000);

            expect(await ex.makerOrderLength(addr1.address)).to.equal(4);
            expect(await ex.tokensOrderLength(token.address, ethAdd)).to.equal(5);

            await expect(ex.connect(addr1).takeOrder(hash0, 0, 3000, {value:1000}))
                .to.be.revertedWith("Your order");
            await expect(ex.connect(addr2).takeOrder(hash0, 0, 6000, {value:1000}))
                .to.be.revertedWith("Buy less amount");
            await expect(ex.connect(addr2).takeOrder(hash0, 100, 3000, {value:1000}))
                .to.be.revertedWith("Don't need to pay Tokens");
            await expect(ex.connect(addr2).takeOrder(hash0, 0, 3000))
                .to.be.revertedWith("Have to pay ETH");
            await expect(ex.connect(addr2).takeOrder(hash0, 0, 3001, {value:3000}))
                .to.be.revertedWith("less price");
            
            await expect(ex.connect(addr2).takeOrder(hash0, 0, 4000, {value:4000})).to.emit(ex, "Take")
                .withArgs(hash0, addr2.address, token.address, ethAdd, 4000, 4000, 4000, true);

            await expect(ex.connect(addr3).takeOrder(hash0, 0, 3000, {value:4000}))
                .to.be.revertedWith("It's over");

            await expect(ex.connect(addr3).takeOrder(hash1, 0, 1000, {value:3000})).to.emit(ex, "Take")
                .withArgs(hash1, addr3.address, token.address, ethAdd, 5000, 1000, 1000, false);

            const addr3TokenBalance0 = await token.balanceOf(addr3.address);
            const feeTokenBalance0 = await ex.feeTokenAmounts(token.address);
            const feeETHBalance0 = await ex.feeETHAmounts();

            await expect(() => ex.connect(addr3).takeOrder(hash1, 0, 2000, {value:3000}))
                .to.changeEtherBalances([addr1,addr3], [2850,-3000]);
            
            const addr3TokenBalance1 = await token.balanceOf(addr3.address);
            const feeTokenBalance1 = await ex.feeTokenAmounts(token.address);
            const feeETHBalance1 = await ex.feeETHAmounts();

            await expect(addr3TokenBalance1 - addr3TokenBalance0).to.equal(1900);
            await expect(feeTokenBalance1 - feeTokenBalance0).to.equal(100);
            await expect(feeETHBalance1 - feeETHBalance0).to.equal(150);
            
            await expect(ex.connect(addr2).cancel(hash1)).to.be.revertedWith("Access denied");

            await expect(ex.connect(addr1).cancel(hash1)).to.emit(ex, "Cancel").withArgs(hash1);
            
            await expect(ex.connect(addr1).cancel(hash1)).to.be.revertedWith("It's end");
            await expect(ex.connect(addr3).takeOrder(hash1, 0, 2000, {value:3000}))
                .to.be.revertedWith("It's over");

            const hash2 = await _hash(addr3.address,token.address,ethAdd,await ex.nonces(addr3.address));
            await ex.connect(addr3).makeOrderFromTokensToETH(token.address, 4000, 2000);
            await ex.connect(addr2).takeOrder(hash2, 0, 3100, {value:1800});

            await expect(() => ex.connect(addr3).cancel(hash2)).to.changeTokenBalance(token, addr3, 900);
        });
    });

    describe("Withdraw Fee", function () {
        it("Withdraw Fee", async function () {
            const hash0 = await _hash(addr1.address,ethAdd,token.address,await ex.nonces(addr1.address));
            await ex.connect(addr1).makeOrderFromETHToTokens(token.address, 1000, {value:1000});
            const hash1 = await _hash(addr1.address,ethAdd,token.address,await ex.nonces(addr1.address));
            await ex.connect(addr1).makeOrderFromETHToTokens(token.address, 2000, {value:2000});
            const hash2 = await _hash(addr1.address,ethAdd,token.address,await ex.nonces(addr1.address));
            await ex.connect(addr1).makeOrderFromETHToTokens(token.address, 3000, {value:3000});

            await ex.connect(addr2).takeOrder(hash0, 2000, 1000);
            await ex.connect(addr2).takeOrder(hash1, 4000, 2000);
            await ex.connect(addr2).takeOrder(hash2, 6000, 3000);   //12000tokens, 6000wei

            expect(await ex.feeETHAmounts()).to.equal(300);
            expect(await ex.feeTokenAmounts(token.address)).to.equal(600);

            await expect(ex.connect(addr1).withdrawFee(ethAdd, 100)).to.be.revertedWith("Access denied");
            
            expect(feeAdd).to.equal(owner.address);

            await expect(() => ex.connect(owner).withdrawFee(ethAdd, 100)).to.changeEtherBalance(owner, 100);
            await expect(() => ex.connect(owner).withdrawFee(ethAdd, 500)).to.changeEtherBalance(owner, 200);

            await expect(() => ex.connect(owner).withdrawFee(token.address, 200))
                .to.changeTokenBalance(token, owner, 200);
            await expect(() => ex.connect(owner).withdrawFee(token.address, 1000))
                .to.changeTokenBalance(token, owner, 400);
        });
    });

    describe("OrderBook", function () {
        it("OrderBook", async function () {

            OB = await ethers.getContractFactory("OrderBook");
            ob = await OB.deploy(ex.address);
  
            const hash0 = await _hash(addr1.address,ethAdd,token.address,await ex.nonces(addr1.address));
            await ex.connect(addr1).makeOrderFromETHToTokens(token.address, 1000, {value:1000});
            const hash1 = await _hash(addr2.address,ethAdd,token.address,await ex.nonces(addr2.address));
            await ex.connect(addr2).makeOrderFromETHToTokens(token.address, 2000, {value:2000});
            const hash2 = await _hash(addr3.address,ethAdd,token.address,await ex.nonces(addr3.address));
            await ex.connect(addr3).makeOrderFromETHToTokens(token.address, 3000, {value:3000});
            const hash3 = await _hash(addr1.address,ethAdd,token.address,await ex.nonces(addr1.address));
            await ex.connect(addr1).makeOrderFromETHToTokens(token.address, 4000, {value:4000});
            const hash4 = await _hash(addr1.address,ethAdd,token.address,await ex.nonces(addr1.address));
            await ex.connect(addr1).makeOrderFromETHToTokens(token.address, 5000, {value:5000});
            // addr1 : 3   addr2,addr3 : 1,1

            await expect(ob.myOrder(0,1)).to.be.reverted;

            const order0 = await ob.connect(addr1).myOrder(0,2);
            
            expect(order0.orderIds[0]).to.equal(hash0);
            expect(order0.orderIds[1]).to.equal(hash3);
            expect(order0.tokenFromMaker[0]).to.equal(ethAdd);
            expect(order0.tokenFromMaker[1]).to.equal(ethAdd);
            expect(order0.tokenFromTaker[0]).to.equal(token.address);
            expect(order0.tokenFromTaker[1]).to.equal(token.address);
            expect(order0.amountFromMaker[0]).to.equal(1000);
            expect(order0.amountFromMaker[1]).to.equal(4000);
            expect(order0.amountTokens[0]).to.equal(1000);
            expect(order0.amountTokens[1]).to.equal(4000);
            expect(order0.amountSold[0]).to.equal(0);
            expect(order0.amountSold[1]).to.equal(0);
            expect(order0.isEnd[0]).to.equal(false);
            expect(order0.isEnd[1]).to.equal(false);
            
            const order1 = await ob.connect(addr1).myOrder(1,2);
            expect(order1.orderIds[0]).to.equal(hash4);
            expect(order1.tokenFromMaker[0]).to.equal(ethAdd);
            expect(order1.tokenFromTaker[0]).to.equal(token.address);
            expect(order1.amountFromMaker[0]).to.equal(5000);
            expect(order1.amountTokens[0]).to.equal(5000);
            expect(order1.amountSold[0]).to.equal(0);
            expect(order1.isEnd[0]).to.equal(false);
            
            await expect(ob.orderBook(ethAdd,token.address,0,1)).to.be.reverted;

            const order2 = await ob.orderBook(ethAdd,token.address,0,3);

            expect(order2.orderIds[0]).to.equal(hash0);
            expect(order2.orderIds[1]).to.equal(hash1);
            expect(order2.orderIds[2]).to.equal(hash2);
            expect(order2.maker[0]).to.equal(addr1.address);
            expect(order2.maker[1]).to.equal(addr2.address);
            expect(order2.maker[2]).to.equal(addr3.address);
            expect(order2.amountFromMaker[0]).to.equal(1000);
            expect(order2.amountFromMaker[1]).to.equal(2000);
            expect(order2.amountFromMaker[2]).to.equal(3000);
            expect(order2.amountTokens[0]).to.equal(1000);
            expect(order2.amountTokens[1]).to.equal(2000);
            expect(order2.amountTokens[2]).to.equal(3000);
            expect(order2.amountSold[0]).to.equal(0);
            expect(order2.amountSold[1]).to.equal(0);
            expect(order2.amountSold[2]).to.equal(0);
            expect(order2.isEnd[0]).to.equal(false);
            expect(order2.isEnd[1]).to.equal(false);
            expect(order2.isEnd[2]).to.equal(false);

            const order3 = await ob.orderBook(ethAdd,token.address,1,3);

            expect(order3.orderIds[0]).to.equal(hash3);
            expect(order3.orderIds[1]).to.equal(hash4);
            expect(order3.maker[0]).to.equal(addr1.address);
            expect(order3.maker[1]).to.equal(addr1.address);
            expect(order3.amountFromMaker[0]).to.equal(4000);
            expect(order3.amountFromMaker[1]).to.equal(5000);
            expect(order3.amountTokens[0]).to.equal(4000);
            expect(order3.amountTokens[1]).to.equal(5000);
            expect(order3.amountSold[0]).to.equal(0);
            expect(order3.amountSold[1]).to.equal(0);
            expect(order3.isEnd[0]).to.equal(false);
            expect(order3.isEnd[1]).to.equal(false);

            const hash5 = await _hash(owner.address,token.address,ethAdd, await ex.nonces(owner.address));
            await ex.connect(owner).makeOrderFromTokensToETH(token.address, 1000, 1000);
            const hash6 = await _hash(addr2.address,token.address,ethAdd, await ex.nonces(addr2.address));
            await ex.connect(addr2).makeOrderFromTokensToETH(token.address, 2000, 2000);
            const hash7 = await _hash(owner.address,token.address,ethAdd, await ex.nonces(owner.address));
            await ex.connect(owner).makeOrderFromTokensToETH(token.address, 3000, 3000);

            const order4 = await ob.orderBook(token.address,ethAdd,0,5);
            expect(order4.orderIds[0]).to.equal(hash5);
            expect(order4.orderIds[1]).to.equal(hash6);
            expect(order4.orderIds[2]).to.equal(hash7);
            expect(order4.maker[0]).to.equal(owner.address);
            expect(order4.maker[1]).to.equal(addr2.address);
            expect(order4.maker[2]).to.equal(owner.address);
            expect(order4.amountFromMaker[0]).to.equal(1000);
            expect(order4.amountFromMaker[1]).to.equal(2000);
            expect(order4.amountFromMaker[2]).to.equal(3000);
            expect(order4.amountTokens[0]).to.equal(1000);
            expect(order4.amountTokens[1]).to.equal(2000);
            expect(order4.amountTokens[2]).to.equal(3000);
            expect(order4.amountSold[0]).to.equal(0);
            expect(order4.amountSold[1]).to.equal(0);
            expect(order4.amountSold[2]).to.equal(0);
            expect(order4.isEnd[0]).to.equal(false);
            expect(order4.isEnd[1]).to.equal(false);
            expect(order4.isEnd[2]).to.equal(false);

            const order5 = await ob.connect(owner).myOrder(1,15);
            expect(order5.orderIds[0]).to.equal(ethers.constants.HashZero);
            
            const order6 = await ob.orderBook(token.address,ethAdd,1,30);
            expect(order6.orderIds[0]).to.equal(ethers.constants.HashZero);
        });
  });
});