const { expect } = require("chai");
const { BigNumber } = require("@ethersproject/bignumber");

const increaseTime = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
};

describe("Pool", () => {
  let StakedToken;
  let stakedToken;

  let RewardToken;
  let rewardToken;

  let Pool;
  let pool;

  let owner;
  let other;

  beforeEach(async () => {
    StakedToken = await ethers.getContractFactory("StakedToken");
    stakedToken = await StakedToken.deploy();

    RewardToken = await ethers.getContractFactory("RewardToken");
    rewardToken = await RewardToken.deploy("RewardToken", "REWARD", "1000000000000000000000000");

    Pool = await ethers.getContractFactory("Pool");
    pool = await Pool.deploy(stakedToken.address, rewardToken.address, 86400);

    [owner, other] = await ethers.getSigners();
  });

  describe("setRewardDistribution", () => {
    it("can only be called by the owner", async () => {
      await expect(pool.connect(other).setRewardDistribution(other.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("notifyRewardAmount", () => {
    it("can only be called by rewardDistribution", async () => {
      await expect(pool.notifyRewardAmount("1000000000000000000000")).to.be.revertedWith("!distribution");
    });

    it("adds rewards", async () => {
      await pool.setRewardDistribution(owner.address);

      await expect(pool.notifyRewardAmount("1000000000000000000000")).to.emit(pool, "RewardAdded").withArgs("1000000000000000000000");
      expect(await pool.rewardRate()).to.equal(BigNumber.from("1000000000000000000000").div(86400));

      let { timestamp } = await ethers.provider.getBlock();
      expect(await pool.lastUpdateTime()).to.equal(timestamp);
      expect(await pool.periodFinish()).to.equal(timestamp + 86400);

      // add half after 12 hours
      await increaseTime(43200);
      await pool.notifyRewardAmount("500000000000000000000");
      expect(await pool.rewardRate()).to.be.closeTo(BigNumber.from("1000000000000000000000").div(86400), "1000000000000");

      timestamp = (await ethers.provider.getBlock()).timestamp;
      expect(await pool.lastUpdateTime()).to.equal(timestamp);
      expect(await pool.periodFinish()).to.equal(timestamp + 86400);
    });
  });

  describe("stake", () => {
    it("stakes the given amount", async () => {
      await stakedToken.excludeFromFee(pool.address);
      await stakedToken.approve(pool.address, "1000000000000");

      const balance = await stakedToken.balanceOf(owner.address);
      await expect(pool.stake("1000000000000")).to.emit(pool, "Staked").withArgs(owner.address, "1000000000000");

      expect(await pool.totalSupply()).to.equal("1000000000000");
      expect(await pool.balanceOf(owner.address)).to.equal("1000000000000");
      expect(balance.sub(await stakedToken.balanceOf(owner.address))).to.equal("1000000000000");

      await stakedToken.transfer(other.address, "1000000000000");
      await stakedToken.connect(other).approve(pool.address, "1000000000000");

      await expect(pool.connect(other).stake("1000000000000")).to.emit(pool, "Staked").withArgs(other.address, "1000000000000");

      expect(await pool.totalSupply()).to.equal("2000000000000");
      expect(await pool.balanceOf(other.address)).to.equal("1000000000000");
      expect(await stakedToken.balanceOf(other.address)).to.equal("0");
    });
  });

  describe("withdraw", () => {
    it("withdraws the given amount", async () => {
      await stakedToken.excludeFromFee(pool.address);
      await stakedToken.approve(pool.address, "1000000000000");
      await pool.stake("1000000000000");

      await stakedToken.transfer(other.address, "1000000000000");
      await stakedToken.connect(other).approve(pool.address, "1000000000000");
      await pool.connect(other).stake("1000000000000");

      const balance = await stakedToken.balanceOf(owner.address);
      await expect(pool.withdraw("1000000000000")).to.emit(pool, "Withdrawn").withArgs(owner.address, "1000000000000");

      expect(await pool.totalSupply()).to.equal("1000000000000");
      expect(await pool.balanceOf(owner.address)).to.equal("0");
      expect((await stakedToken.balanceOf(owner.address)).sub(balance)).to.equal("1000000000000");

      await expect(pool.connect(other).withdraw("1000000000000")).to.emit(pool, "Withdrawn").withArgs(other.address, "1000000000000");

      expect(await pool.totalSupply()).to.equal("0");
      expect(await pool.balanceOf(other.address)).to.equal("0");
      expect(await stakedToken.balanceOf(other.address)).to.equal("1000000000000");
    });
  });

  describe("lastTimeRewardApplicable", () => {
    it("returns the last time rewards could be earned", async () => {
      await pool.setRewardDistribution(owner.address);
      await pool.notifyRewardAmount("1000000000000000000000");

      await increaseTime(43200);

      const { timestamp } = await ethers.provider.getBlock();
      expect(await pool.lastTimeRewardApplicable()).to.equal(timestamp);

      await increaseTime(43200);

      expect(await pool.lastTimeRewardApplicable()).to.equal(await pool.periodFinish());
    });
  });

  describe("rewardPerToken", () => {
    it("returns the number of reward tokens per staked token", async () => {
      await pool.setRewardDistribution(owner.address);
      await pool.notifyRewardAmount("1000000000000000000000");

      await stakedToken.approve(pool.address, "1000000000000");
      await pool.stake("1000000000000");

      await increaseTime(86400);

      expect(await pool.rewardPerToken()).to.closeTo("1000000000000000000", "100000000000000000");

      await pool.withdraw("1000000000000");
      expect(await pool.totalSupply()).to.equal("0");

      expect(await pool.rewardPerToken()).to.closeTo("1000000000000000000", "100000000000000000");
    });
  });

  describe("earned", () => {
    it("returns the amount of rewards earned", async () => {
      await stakedToken.excludeFromFee(pool.address);
      await stakedToken.approve(pool.address, "1000000000000");
      await pool.stake("1000000000000");

      await rewardToken.transfer(pool.address, "1000000000000000000000");
      await pool.setRewardDistribution(owner.address);
      await pool.notifyRewardAmount("1000000000000000000000");

      await increaseTime(3600);

      expect(await pool.earned(owner.address)).to.be.closeTo(BigNumber.from("1000000000000000000000").div(24), "100000000000000000");

      await pool.getReward();
      await increaseTime(3600);

      expect(await pool.earned(owner.address)).to.be.closeTo(BigNumber.from("1000000000000000000000").div(24), "100000000000000000");

      await pool.getReward();
      await stakedToken.transfer(other.address, "1000000000000");
      await stakedToken.connect(other).approve(pool.address, "1000000000000");
      await pool.connect(other).stake("1000000000000");
      await increaseTime(3600);

      expect(await pool.earned(owner.address)).to.be.closeTo(BigNumber.from("1000000000000000000000").div(24).div(2), "100000000000000000");
      expect(await pool.earned(other.address)).to.be.closeTo(BigNumber.from("1000000000000000000000").div(24).div(2), "100000000000000000");
    });
  });

  describe("getReward", () => {
    it("withdraws the amount of rewards earned", async () => {
      await rewardToken.transfer(pool.address, "1000000000000000000000");
      await pool.setRewardDistribution(owner.address);
      await pool.notifyRewardAmount("1000000000000000000000");

      await stakedToken.approve(pool.address, "1000000000000");
      await pool.stake("1000000000000");

      const balance = await rewardToken.balanceOf(owner.address);
      await increaseTime(3600);

      const earned = await pool.earned(owner.address);
      await expect(pool.getReward()).to.emit(pool, "RewardPaid");
      expect((await rewardToken.balanceOf(owner.address)).sub(balance)).to.be.closeTo(earned, "100000000000000000");
    });
  });

  describe("exit", () => {
    it("withdraws the staked amount and the amount of rewards earned", async () => {
      await rewardToken.transfer(pool.address, "1000000000000000000000");
      await pool.setRewardDistribution(owner.address);
      await pool.notifyRewardAmount("1000000000000000000000");

      await stakedToken.excludeFromFee(pool.address);
      await stakedToken.approve(pool.address, "1000000000000");
      await pool.stake("1000000000000");

      const stakedTokenBalance = await stakedToken.balanceOf(owner.address);
      const rewardTokenBalance = await rewardToken.balanceOf(owner.address);
      await increaseTime(3600);

      const earned = await pool.earned(owner.address);
      await expect(pool.exit())
        .to.emit(pool, "Withdrawn").withArgs(owner.address, "1000000000000")
        .to.emit(pool, "RewardPaid");
      expect((await rewardToken.balanceOf(owner.address)).sub(rewardTokenBalance)).to.be.closeTo(earned, "100000000000000000");

      expect(await pool.totalSupply()).to.equal("0");
      expect(await pool.balanceOf(owner.address)).to.equal("0");
      expect((await stakedToken.balanceOf(owner.address)).sub(stakedTokenBalance)).to.equal("1000000000000");
    });
  });

  describe("totalSupply", () => {
    it("accounts for static rewards", async () => {
      await stakedToken.includeInFee(owner.address);
      await stakedToken.excludeFromFee(pool.address);

      await stakedToken.approve(pool.address, "1000000000000");
      await pool.stake("1000000000000");

      expect(await pool.totalSupply()).to.equal("1000000000000");

      await stakedToken.transfer(other.address, "100000000000000000000000");

      // 5% of the 10% of the total supply transferred == 5000000000000000000000
      // the pool holds 1e-12 of the total suppply
      expect(await pool.totalSupply()).to.be.at.least("1005000000000");
    });
  });

  describe("balanceOf", () => {
    it("accounts for static rewards", async () => {
      await stakedToken.includeInFee(owner.address);
      await stakedToken.excludeFromFee(pool.address);

      await stakedToken.approve(pool.address, "1000000000000");
      await pool.stake("1000000000000");

      expect(await pool.balanceOf(owner.address)).to.equal("1000000000000");

      await stakedToken.transfer(other.address, "100000000000000000000000");

      // 5% of the 10% of the total supply transferred == 5000000000000000000000
      // the pool holds 1e-12 of the total suppply
      expect(await pool.balanceOf(owner.address)).to.be.at.least("1005000000000");
      expect(await pool.totalSupply()).to.equal(await pool.balanceOf(owner.address));

      await stakedToken.connect(other).approve(pool.address, "1000000000000");
      await pool.connect(other).stake("1000000000000");

      // amount transferred ≅ 90000000000000000000000
      await stakedToken.connect(other).transfer(owner.address, await stakedToken.balanceOf(other.address));

      // 5% of the amount transferred ≅ 4500000000000000000000
      // each account staked 1e-12 of the total suppply
      expect(await pool.totalSupply()).to.be.at.least("2014000000000");
      expect(await pool.balanceOf(owner.address)).to.be.at.least("1009500000000");
      expect(await pool.balanceOf(other.address)).to.be.at.least("1004500000000");

      // make sure we can withdraw
      await expect(pool.exit());
      await expect(pool.connect(other).exit());
    });
  });
});
