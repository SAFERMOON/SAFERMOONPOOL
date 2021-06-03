pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ISaferMoon.sol";

contract SaferMoonWrapper {
    using SafeMath for uint256;

    ISaferMoon public stakedToken;

    uint256 private _totalReflections;
    mapping(address => uint256) private _reflections;

    constructor(address _stakedToken) public {
        stakedToken = ISaferMoon(_stakedToken);
    }

    function totalSupply() public view returns (uint256) {
        return stakedToken.tokenFromReflection(_totalReflections);
    }

    function balanceOf(address account) public view returns (uint256) {
        return stakedToken.tokenFromReflection(_reflections[account]);
    }

    function stake(uint256 amount) public {
        _totalReflections = _totalReflections.add(stakedToken.reflectionFromToken(amount, false));
        _reflections[msg.sender] = _reflections[msg.sender].add(stakedToken.reflectionFromToken(amount, !stakedToken.isExcludedFromFee(address(this))));
        stakedToken.transferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public {
        _totalReflections = _totalReflections.sub(stakedToken.reflectionFromToken(amount, false));
        _reflections[msg.sender] = _reflections[msg.sender].sub(stakedToken.reflectionFromToken(amount, false)); // don't deduct fee before transfer
        stakedToken.transfer(msg.sender, amount);
    }
}
