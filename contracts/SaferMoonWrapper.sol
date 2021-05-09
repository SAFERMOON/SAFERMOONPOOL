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
        _totalReflections = stakedToken.reflectionFromToken(totalSupply().add(amount), false);
        _reflections[msg.sender] = stakedToken.reflectionFromToken(stakedToken.tokenFromReflection(_reflections[msg.sender]).add(amount), false);
        stakedToken.transferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public {
        _totalReflections = stakedToken.reflectionFromToken(totalSupply().sub(amount), false);
        _reflections[msg.sender] = stakedToken.reflectionFromToken(stakedToken.tokenFromReflection(_reflections[msg.sender]).sub(amount), false);
        stakedToken.transfer(msg.sender, amount);
    }
}
