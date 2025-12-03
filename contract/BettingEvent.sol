// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.28;

import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract BettingEvent is AutomationCompatible, ReentrancyGuard {

    // Modifier to restrict functions to only the owner
    modifier onlyOwner() {
        require(msg.sender == bettingEvent.owner, "Only owner can call this function");
        _;
    }

    event msgToUser(address indexed user, string message);
    event globalMessage(string message); // Global message event

    struct Event {
        address owner;
        string description;
        uint currBetValue;
        uint currSFactor;
        uint sFactorInitial;
        uint currBlockId;
        uint currBets;
        mapping(uint => Block) blocks; // Maps block ID to Block struct
        mapping(address => bool) hasBet;
        uint vault;
        uint contributionVault;
        bool isOpen;
        uint baseTimestamp; // Timestamp base to generate dates
    }

    struct UserBet {
        address user;
        uint choice;
        uint registration_date;
    }

    struct Block {
        uint id;
        uint betValue;
        uint sFactor;
        uint blockSize;
        uint[] availableDates;
        mapping(address => UserBet) bets;
        address[] betUsers;
        mapping(uint => bool) dateOccupied; // Mapping to track occupied dates
        bool isOpen;
    }

    struct VotingData {
        bool votingStarted;
        uint votingStartTimestamp;
        uint votingDeadline;
        uint votesToEnd;
        uint votesAgainstEnd;
        address[] votersList; // Array to keep track of voters (verification + reset)
        address[] trueVoters; // Array of addresses that voted "true"
        mapping(address => uint) addressPunished; // Mapping of punished addresses with release timestamp
    }

    struct WinningDate {
        bool eventCompleted; // Indicates if the event is completed and the prize can be withdrawn
        uint eventCompletedTimestamp; // Timestamp when eventCompleted was set to true
        uint finalWinningDate; // Final winning date stored
        address winnerAddress; // Address of the final winner
        mapping(address => uint) hasVotedRound; // Mapping: user => round they voted in
        mapping(uint => mapping(uint => uint)) dateVoteCount; // Mapping: round => (date => votes)
        uint[] proposedDates; // Array of all proposed dates
        bool votingStarted; // If the voting for the winning date has started
        uint minTimeForConsensus; // Minimum time for consensus on winning date
        uint currentRound; // Round counter for voting
    }

    // Unique instance of the betting event
    Event public bettingEvent;

    // Instance for voting data
    VotingData public votingData;

    // Instance for winning date data
    WinningDate public winningDateData;

    constructor(string memory _description, uint _initialBetValue) {
        // Initializes the event only once in the constructor
        uint initialSFactor = _initialBetValue / 6;

        bettingEvent.owner = msg.sender;
        bettingEvent.description = _description;
        bettingEvent.currBetValue = _initialBetValue;
        bettingEvent.sFactorInitial = initialSFactor;
        bettingEvent.currSFactor = initialSFactor;
        bettingEvent.currBlockId = 1; // Initialize as 1 for the genesis block
        bettingEvent.currBets = 0;
        bettingEvent.vault = 0; // Initialize betting vault
        bettingEvent.contributionVault = 0; // Initialize contribution vault
        bettingEvent.isOpen = true;

        votingData.votingStarted = false;
        votingData.votingStartTimestamp = 0;
        votingData.votingDeadline = 0;
        votingData.votesToEnd = 0;
        votingData.votesAgainstEnd = 0;

        winningDateData.eventCompleted = false;
        winningDateData.eventCompletedTimestamp = 0;
        winningDateData.finalWinningDate = 0;
        winningDateData.winnerAddress = address(0);
        winningDateData.votingStarted = false;
        winningDateData.minTimeForConsensus = 0;
        winningDateData.currentRound = 0; // Round counter for voting

        // TODO: Create a sequence of dates
        uint baseTimestamp = 1766016000; // 18 December 2025 00:00:00
        bettingEvent.baseTimestamp = baseTimestamp; // Store in struct for later use
        uint daysOffset = 8;
        uint[] memory genesisDates = generateTimestamp(baseTimestamp, daysOffset);

        // Create the genesis block directly without using createBlock to avoid inconsistency
        Block storage genesisBlock = bettingEvent.blocks[1];
        genesisBlock.id = 1;
        genesisBlock.betValue = _initialBetValue;
        genesisBlock.sFactor = initialSFactor;
        genesisBlock.blockSize = 8;
        genesisBlock.availableDates = genesisDates;
        genesisBlock.isOpen = true;
    }

    // Add variable to store the automation forwarder address
    address public automationForwarder;

    // Add in constructor or setup function
    function setAutomationForwarder(address _forwarder) external onlyOwner {
        automationForwarder = _forwarder;
    }


    // Function 1: checkUpkeep (called by Chainlink Automation)
    function checkUpkeep(bytes calldata /* checkData */) 
        external view override returns (bool upkeepNeeded, bytes memory /* performData */) {

        // Reuse checkAvailableSlotsInFuture()
        bool availableSlotsInFuture = checkAvailableSlotsInFuture();
        
        // Conditions for automation:
        upkeepNeeded = (
            bettingEvent.isOpen &&                    // Event must be open
            bettingEvent.currBlockId > 0 &&           // Must have at least one block
            !availableSlotsInFuture                   // No slots 5+ days in the future
        );
        // No need to return specific data
        return (upkeepNeeded, "");
    }

    // FUNCTION 2: performUpkeep (executes the action)
    function performUpkeep(bytes calldata /* performData */) external override {
        require(msg.sender == automationForwarder, "Only Chainlink Automation can perform upkeep");

        // Validate conditions again (security)
        bool availableSlotsInFuture = checkAvailableSlotsInFuture();
        require(!availableSlotsInFuture, "Upkeep not needed");
        require(bettingEvent.isOpen, "Event is closed");

        // Execute block creation logic
        _createBlockAutoInternal();
    }

    // FUNCTION 3: Internal logic (extracted from createBlockAuto)
    function _createBlockAutoInternal() private {
        // Move all current createBlockAuto logic here
        // (without the onlyOwner require, as it will be called by Chainlink)
        require(bettingEvent.isOpen, "Event is closed");

        Block storage currentBlock = bettingEvent.blocks[bettingEvent.currBlockId];

        // Return the current timestamp of the bot call
        uint currentTimestamp = block.timestamp;

        // Calculate timestamp 5 days in the future from the call
        uint futureThreshold = currentTimestamp + 5 days;

        // SECURITY CHECK: If event was reopened after being closed, validate current block's temporal relevance
        // Check if any dates in the current block are in the past (already expired)
        bool hasExpiredDates = false;
        
        if (currentBlock.availableDates.length > 0) {
            for (uint i = 0; i < currentBlock.availableDates.length; i++) {
                if (currentBlock.availableDates[i] <= currentTimestamp) {
                    hasExpiredDates = true;
                    break;
                }
            }
            
            // If there are expired dates, this indicates the event was closed and reopened
            // Force creation of a new block with dates starting 5 days from current timestamp
            if (hasExpiredDates) {
                // Calculate the new block size based on the occupancy rate of the current block
                uint newBlockSize = adjustBlockSize(bettingEvent.currBlockId);
                // Calculate new bet values based on demand
                (uint newBetValue, uint newSFactor) = adjustBetValue(bettingEvent.currBlockId);
                
                // Start new dates 5 days from current timestamp (as per requirement)
                uint startDate = currentTimestamp + 5 days;
                // Align to start of day (00:00:00 GMT)
                startDate = (startDate / 86400) * 86400;
                
                // Generate new dates
                uint[] memory newDates = generateTimestamp(startDate, newBlockSize);
                
                // Create the new block
                createBlock(newBlockSize, newDates, newBetValue, newSFactor);
                return; // Exit early after creating the block
            }
        }

        // Check if there are available dates for betting 5 days in the future
        bool availableSlotsInFuture = true;

        // Check conditions for automatic creation:
        // 1. No slots available with dates 5+ days in the future
        // 2. OR the current timestamp is 5 days from the last available date in the block

        // Check if the last available date in the block is less than or equal to the futureThreshold
        if (currentBlock.availableDates.length > 0) {
            uint lastAvailableDate = currentBlock.availableDates[currentBlock.availableDates.length - 1];

            // If the last available date is less than or equal to the futureThreshold, there are no slots in the future
            if (lastAvailableDate <= futureThreshold) {
                availableSlotsInFuture = false;
            } else {
                // Check if all dates after futureThreshold are occupied
                bool hasAvailableFutureSlots = false;
                
                for (uint i = 0; i < currentBlock.availableDates.length; i++) {
                    uint date = currentBlock.availableDates[i];

                    // If the date is greater than futureThreshold and is not occupied
                    if (date > futureThreshold && !currentBlock.dateOccupied[date]) {
                        hasAvailableFutureSlots = true;
                        break;
                    }
                }
                
                availableSlotsInFuture = hasAvailableFutureSlots;
            }
        } else {
            // If there are no available dates, there are no slots in the future
            availableSlotsInFuture = false;
        }

        // If there are no slots available in the future, create a new block
        if (!availableSlotsInFuture) {
            // Count how many occupied dates exist after futureThreshold
            uint occupiedDatesAfterThreshold = 0;
            
            for (uint i = 0; i < currentBlock.availableDates.length; i++) {
                uint date = currentBlock.availableDates[i];

                // If the date is greater than futureThreshold and is occupied
                if (date > futureThreshold && currentBlock.dateOccupied[date]) {
                    occupiedDatesAfterThreshold++;
                }
            }

            // Calculate the new block size based on the occupancy rate of the current block
            uint newBlockSize = adjustBlockSize(bettingEvent.currBlockId);
            // Calculate new bet values based on demand
            (uint newBetValue, uint newSFactor) = adjustBetValue(bettingEvent.currBlockId);

            // Get the last date of the current block
            uint lastDate = currentBlock.availableDates[currentBlock.availableDates.length - 1];

            // Determine the first date of the next block based on the specified logic
            if (occupiedDatesAfterThreshold >= 5) {
                // Many dates occupied after threshold: next block in sequence
                lastDate = lastDate + 1 days;
            } else {
                // Few dates occupied after threshold: create 5-day gap
                lastDate = lastDate + 5 days;
            }

            // Generate new dates
            uint[] memory newDates = generateTimestamp(lastDate, newBlockSize);

            // Create the new block
            createBlock(newBlockSize, newDates, newBetValue, newSFactor);
        }

    }

    // Function to create a new block
    function createBlock(
        uint _blockSize, 
        uint[] memory _availableDates, 
        uint _betValue, 
        uint _sFactor
        ) private {
        require(bettingEvent.isOpen, "Event is closed");

        // Close the current block (if it exists)
        if (bettingEvent.currBlockId > 0) {
            Block storage currentBlock = bettingEvent.blocks[bettingEvent.currBlockId];
            currentBlock.isOpen = false;
        }

        uint newBlockId = bettingEvent.currBlockId + 1;

        // Create a new block
        Block storage newBlock = bettingEvent.blocks[newBlockId];
        newBlock.id = newBlockId;
        newBlock.betValue = _betValue;
        newBlock.sFactor = _sFactor;
        newBlock.blockSize = _blockSize;
        newBlock.availableDates = _availableDates;
        newBlock.isOpen = true;

        // Update the current block ID in the event
        bettingEvent.currBlockId = newBlockId;

        // Update currBetValue and currSFactor in the Event struct with the values from the new block
        bettingEvent.currBetValue = newBlock.betValue;
        bettingEvent.currSFactor = newBlock.sFactor;
    }

    // Function to place a bet in the current block
    function placeBet(uint _choice) public payable {
        require(bettingEvent.isOpen, "Event is closed");
        require(msg.value == bettingEvent.currBetValue, "Incorrect bet value");
        
        Block storage currentBlock = bettingEvent.blocks[bettingEvent.currBlockId];
        require(currentBlock.isOpen, "Current block is closed");
        require(currentBlock.betUsers.length < currentBlock.blockSize, "Block is full");

        // Check if the chosen date is at least 5 days in the future
        // TODO: 5 DAYS
        require(_choice >= block.timestamp + 5 days, "Date must be at least 5 day in the future");

        // Check if the bet corresponds to the last available bet in the block
        require(currentBlock.betUsers.length < currentBlock.blockSize - 1, "This is the last bet available. Call 'placeBetAndCreateBlock' instead.");

        // Check if the chosen date is valid and available
        require(isValidAndAvailableDate(bettingEvent.currBlockId, _choice), "Invalid date choice or date already taken");

        // Check if the user has already placed a bet
        require(!bettingEvent.hasBet[msg.sender], "User has already placed a bet");

        // Register the user's bet
        UserBet memory newBet = UserBet({
            user: msg.sender,
            choice: _choice,
            registration_date: block.timestamp
        });
        
        currentBlock.bets[msg.sender] = newBet;
        currentBlock.betUsers.push(msg.sender);

        // Mark the date as occupied
        currentBlock.dateOccupied[_choice] = true;
        
        bettingEvent.hasBet[msg.sender] = true;
        bettingEvent.currBets++;

        // Add the bet amount to the main vault
        bettingEvent.vault += msg.value;
    }

    // Function to place the last bet in the block and create a new block afterwards
    function placeBetAndCreateBlock(uint _choice) public payable {
        require(bettingEvent.isOpen, "Event is closed");
        require(msg.value == bettingEvent.currBetValue, "Incorrect bet value");

        Block storage currentBlock = bettingEvent.blocks[bettingEvent.currBlockId];
        require(currentBlock.isOpen, "Current block is closed");
        require(currentBlock.betUsers.length < currentBlock.blockSize, "Block is full");

        // Check if the chosen date is at least 5 days in the future
        // TODO: 5 DAYS
        require(_choice >= block.timestamp + 5 days, "Date must be at least 5 days in the future");

        // Check if the bet corresponds EXACTLY to the last available bet in the block
        require(currentBlock.betUsers.length == currentBlock.blockSize - 1, "This is not the last bet available. Call 'placeBet' instead.");

        // Check if the chosen date is valid and available
        require(isValidAndAvailableDate(bettingEvent.currBlockId, _choice), "Invalid date choice or date already taken");

        // Check if the user has already placed a bet
        require(!bettingEvent.hasBet[msg.sender], "User has already placed a bet");
        
        // REPLICATE the logic of placeBet (cannot call placeBet because of restriction)
        UserBet memory newBet = UserBet({
            user: msg.sender,
            choice: _choice,
            registration_date: block.timestamp
        });
        
        currentBlock.bets[msg.sender] = newBet;
        currentBlock.betUsers.push(msg.sender);

        // Mark the date as occupied
        currentBlock.dateOccupied[_choice] = true;
        
        bettingEvent.hasBet[msg.sender] = true;
        bettingEvent.currBets++;

        // Add the bet amount to the main vault
        bettingEvent.vault += msg.value;

        // Calculate the new block size based on the current block's occupancy rate
        uint newBlockSize = adjustBlockSize(bettingEvent.currBlockId);
        // Calculate new bet values based on demand
        (uint newBetValue, uint newSFactor) = adjustBetValue(bettingEvent.currBlockId);
        // Return the last date of the current block
        uint lastDate = currentBlock.availableDates[currentBlock.availableDates.length - 1];
        // Add one day to the last date
        lastDate = lastDate + 1 days;
        // Add new dates in sequence
        uint[] memory newDates = generateTimestamp(lastDate, newBlockSize);
        // After the last bet, create a new block with the adjusted size
        createBlock(newBlockSize, newDates, newBetValue, newSFactor);
    }

    // Function to automatically create a block when the previous one was not filled (called by the owner)
    function createBlockAuto() external onlyOwner {
        _createBlockAutoInternal();
    }

    // Function to contribute to the betting pool without registering a bet date
    function contributeToPool() public payable {
        require(bettingEvent.isOpen, "Event is closed");
        // The contribution amount must be greater than the minimum = betValue of the genesis block
        require(msg.value >= bettingEvent.blocks[1].betValue, "Must send more than the genesis block bet value");

        // Transfer funds from the user to the contribution vault
        bettingEvent.contributionVault += msg.value;
    }

    // Function called by participants to end the event
    function endEvent(uint _userBlockId, bool _voteToEnd) public {
        require(bettingEvent.isOpen, "Event is closed");
        // Check if the user is punished
        require(votingData.addressPunished[msg.sender] == 0 || 
        block.timestamp >= votingData.addressPunished[msg.sender], 
        "User is punished and cannot vote");

        // If the user was punished but the period has expired, clear the punishment
        if (votingData.addressPunished[msg.sender] > 0 && block.timestamp >= votingData.addressPunished[msg.sender]) {
            votingData.addressPunished[msg.sender] = 0;
        }

        // TODO: Check if 50 days have passed since baseTimestamp
        require(block.timestamp >= bettingEvent.baseTimestamp + 50 days, "It hasn't even been 50 days since the betting started.");
        // TODO: Check if the event has at least 100 bets
        require(bettingEvent.currBets >= 100, "Not enough bets placed (100 required).");

        // Check if the user has placed a bet in the block with id = _userBlockId
        bool userHasBet = false;
        for (uint i = 0; i < bettingEvent.blocks[_userBlockId].betUsers.length; i++) {
            address user = bettingEvent.blocks[_userBlockId].betUsers[i];
            if (user == msg.sender) {
                // User placed a bet in the specified block
                userHasBet = true;
                break;
            }
        }
        require(userHasBet, "User has not placed a bet in the specified block");

        // Check if the user must have a bet with a date BEFORE the timestamp they call the endEvent function
        UserBet memory userBetChoice = bettingEvent.blocks[_userBlockId].bets[msg.sender];
        // TODO: For testing purposes, we can comment this out
        require(userBetChoice.choice < block.timestamp, "User bet date must be before current time to vote");

        // Check if the user has already voted (prevent double voting)
        require(!_hasUserVotedInCurrentRound(msg.sender), "User has already voted");

        // If voting has not started yet
        if (!votingData.votingStarted) {
            require(_voteToEnd == true, "Voting can only start with a vote \"true\" to end");
            votingData.votingStartTimestamp = block.timestamp;
            votingData.votingStarted = true;

            // Register the first vote (which is mandatory "true")
            votingData.votersList.push(msg.sender); // Add to the list of voters
            votingData.trueVoters.push(msg.sender); // Add to the array of "true" voters
            votingData.votesToEnd++;
            emit msgToUser(msg.sender, "Voting to close event STARTED!");
            // TODO: Deadline of 10 days for voting 
            votingData.votingDeadline = block.timestamp + 10 days;
        } else {
            // Check if voting deadline has passed before allowing new votes
            if (block.timestamp > votingData.votingDeadline) {
                // Voting deadline expired - execute conclusion logic
                _concludeVoting();
                return; // Exit function after concluding voting
            }

            // Voting has already started and is still within deadline - register vote normally
            votingData.votersList.push(msg.sender); // Add to the list of voters

            // Process vote based on the _voteToEnd parameter
            if (_voteToEnd) {
                votingData.trueVoters.push(msg.sender); // Add to the array of "true" voters
                votingData.votesToEnd++;
                emit msgToUser(msg.sender, "Vote registered: true");
            } else {
                votingData.votesAgainstEnd++;
                emit msgToUser(msg.sender, "Vote registered: false");
            }
        }
    }

    // Function called by users to set winner date and pay total prize
    function eventCompleted(
        uint _userBlockId, 
        uint _winningDate
        ) public returns (
            uint winningDate, 
            uint voteCount
            ) {
        // Can only be called if the event is closed
        require(bettingEvent.isOpen == false, "Event is still open");

        //Check if the user has bet on the block with id = _userBlockId
        bool userHasBet = false;
        for (uint i = 0; i < bettingEvent.blocks[_userBlockId].betUsers.length; i++) {
            address user = bettingEvent.blocks[_userBlockId].betUsers[i];
            if (user == msg.sender) {
                // User has bet on the specified block
                userHasBet = true;
                break;
            }
        }
        require(userHasBet, "User has not bet in the specified block");

        // The user must have a bet placed before the timestamp when they call the eventCompleted function
        UserBet memory userBetChoice = bettingEvent.blocks[_userBlockId].bets[msg.sender];
        uint256 userBetDate = userBetChoice.choice;
        // TODO: For testing purposes, we can comment this out
        require(userBetDate < block.timestamp, "User's bet date must be before current time to vote");

        // Logic to set winner date and pay prize
        // Check if the chosen date choice is valid 
        require(isValidWinningDate(_winningDate), "Invalid winning date choice");

        // If voting has not started yet, start a new round
        if (!winningDateData.votingStarted) {
            winningDateData.votingStarted = true;
            winningDateData.currentRound++; // Increment round FIRST
            // TODO: 20 DAYS
            winningDateData.minTimeForConsensus = block.timestamp + 20 days; // 20 days to vote on the winning date
            emit globalMessage("Voting for winning date STARTED!");
        }

        // Check if the user has already voted in the current round (AFTER incrementing currentRound)
        require(winningDateData.hasVotedRound[msg.sender] != winningDateData.currentRound, "User has already voted for a winning date");

        // Register the user's vote in the current round
        winningDateData.hasVotedRound[msg.sender] = winningDateData.currentRound;
        winningDateData.dateVoteCount[winningDateData.currentRound][_winningDate]++; // Increment round's vote count

        // Add the date to the proposed dates array if it doesn't exist yet
        bool dateExists = false;
        for (uint i = 0; i < winningDateData.proposedDates.length; i++) {
            if (winningDateData.proposedDates[i] == _winningDate) {
                dateExists = true;
                break;
            }
        }
        if (!dateExists) {
            winningDateData.proposedDates.push(_winningDate);
        }
        
        emit msgToUser(msg.sender, "Vote for winning date registered!");

        // The count is already automatically updated in dateVoteCount
        // Return "dates" and "voteCounts" after minTimeForConsensus
        if (block.timestamp > winningDateData.minTimeForConsensus) {
            uint[] memory dates = winningDateData.proposedDates;
            uint[] memory voteCounts = new uint[](dates.length);
            for (uint i = 0; i < dates.length; i++) {
                voteCounts[i] = winningDateData.dateVoteCount[winningDateData.currentRound][dates[i]];
            }
            // Find the highest value in "voteCounts" and return the index
            uint winningDateIndex = 0;
            for (uint i = 1; i < voteCounts.length; i++) {
                if (voteCounts[i] > voteCounts[winningDateIndex]) {
                    winningDateIndex = i;
                }
            }
            // Calculate the number of votes for the date with the most votes and divide by the total votes
            uint totalVotes = 0;
            for (uint i = 0; i < voteCounts.length; i++) {
                totalVotes += voteCounts[i];
            }
            uint percentage = (voteCounts[winningDateIndex] * 100) / totalVotes;
            // TODO: 30 VOTES
            uint minVoteToEnd = 30; // 30 votes required to conclude

            // If the percentage is greater than or equal to 80%, consider the date as the winner.
            if (percentage >= 80 && totalVotes >= minVoteToEnd) {
                uint finalWinningDate = dates[winningDateIndex];

                // Check if the winning date received a bet
                address potentialWinner = _findWinnerInAllBlocks(finalWinningDate);

                // If there is no winner for the chosen date, find the nearest previous date that received a bet
                if (potentialWinner == address(0)) {
                    finalWinningDate = findNearestPreviousDateWithBet(finalWinningDate);
                    potentialWinner = _findWinnerInAllBlocks(finalWinningDate);
                }

                winningDateData.votingStarted = false; // Close voting for winning date
                winningDateData.eventCompleted = true; // Allow prize withdrawal
                winningDateData.eventCompletedTimestamp = block.timestamp; // Store timestamp when event was completed
                winningDateData.finalWinningDate = finalWinningDate; // Store final winning date
                winningDateData.winnerAddress = potentialWinner; // Store winner address
                
                return (finalWinningDate, voteCounts[winningDateIndex]);
            } else if (percentage < 80 && percentage >= 50 && totalVotes >= minVoteToEnd) {
                // If the percentage is less than 80% and greater than 50%, keep voting for longer
                winningDateData.votingStarted = true;
                // TODO: 20 DAYS
                winningDateData.minTimeForConsensus = block.timestamp + 20 days; // 20 days to vote on the winning date
                // Return values indicating that voting is ongoing
                winningDateData.eventCompleted = false;
                return (0, 0);
            } else if (percentage < 50 && totalVotes >= minVoteToEnd) {
                // If the percentage is less than 50%, cancel the voting and open the event
                bettingEvent.isOpen = true;
                winningDateData.eventCompleted = false;
                _resetWinningDateData();
                _resetVotingData(); // Reset voting data to allow future event closure votes
                // Return values indicating that the vote was canceled
                return (0, 0);
            } else {
                // If totalVotes < minVoteToEnd, extend voting period to receive more votes
                winningDateData.votingStarted = true;
                // TODO: 20 DAYS
                winningDateData.minTimeForConsensus = block.timestamp + 20 days; // 20 days to vote on the winning date
                // Return values indicating that voting is ongoing
                winningDateData.eventCompleted = false;
                return (0, 0);
            }
        } else {
            // Still within the voting period - return values indicating that it is in progress
            winningDateData.eventCompleted = false;
            return (0, 0);
        }

    }

    // Function that allows the withdrawal of the total prize ONLY by the winner when eventCompleted == true
    function withdrawPrize() public nonReentrant {
        require(winningDateData.eventCompleted, "Event is not completed or winning date not decided");
        require(winningDateData.eventCompletedTimestamp > 0, "Event completion timestamp not set");
        require(winningDateData.winnerAddress != address(0), "No winner found");

        // Calculate days passed since event was completed
        uint daysPassed = (block.timestamp - winningDateData.eventCompletedTimestamp) / 30 days; // TODO: 30 DAYS
        
        // Determine current eligible winner based on 30-day intervals
        address currentWinner;
        // TODO: daysPassed < 1
        if (daysPassed < 1) {
            // Within first 30 days: only original winner can withdraw
            currentWinner = winningDateData.winnerAddress;
        } else {
            // After 30+ days: find alternative winner
            uint iterationsNeeded = daysPassed;
            uint currentDate = winningDateData.finalWinningDate;
            
            // Find the appropriate winner based on 30-day intervals
            for (uint i = 0; i < iterationsNeeded; i++) {
                uint previousDate = findNearestPreviousDateWithBet(currentDate - 1 days);
                if (previousDate == 0) {
                    // No more previous dates found, keep current winner
                    break;
                }
                currentDate = previousDate;
            }
            
            currentWinner = _findWinnerInAllBlocks(currentDate);
        }
        
        require(currentWinner != address(0), "No eligible winner found");
        require(msg.sender == currentWinner, "Only the current eligible winner can withdraw the prize");

        // Calculate total prize (vault + contributionVault)
        uint totalPrize = bettingEvent.vault + bettingEvent.contributionVault;
        require(totalPrize > 0, "No prize available");

        // Reset vaults to avoid double withdrawal (Effects before Interactions)
        bettingEvent.vault = 0;
        bettingEvent.contributionVault = 0;
        
        // Transfer prize to current winner (transfer is safe: 2300 gas limit)
        payable(currentWinner).transfer(totalPrize);
        
        emit msgToUser(currentWinner, "Prize withdrawn successfully!");
    }

    // Internal function to handle voting conclusion logic
    function _concludeVoting() private {
        // TODO: 30 VOTES
        uint minVoteToEnd = 30; // 30
        uint contestationRate = (votingData.votesAgainstEnd * 100) / (votingData.votesToEnd + votingData.votesAgainstEnd);
        
        if (votingData.votesToEnd >= minVoteToEnd) {
            if (contestationRate >= 10) {
                // Voting failed due to high contestation - PUNISH the trueVoters
                emit globalMessage("Voting to close event FAILED due to high contestation!");

                // Punish all addresses that voted "true" for 30 days
                // TODO: 30 DAYS
                uint punishmentPeriod = block.timestamp + 30 days;
                for (uint i = 0; i < votingData.trueVoters.length; i++) {
                    votingData.addressPunished[votingData.trueVoters[i]] = punishmentPeriod;
                }

                // Reset voting variables (except punishments)
                _resetVotingData();
            } else {
                // Voting approved without significant contestation
                emit globalMessage("Voting to close event APPROVED!");
                // Close the event
                bettingEvent.isOpen = false;
                votingData.votingStarted = false;
            }
        } else {
            // Voting rejected due to insufficient votes - PUNISH the trueVoters
            emit globalMessage("Voting failed due to insufficient votes");

            // Punish all addresses that voted "true" for 30 days
            // TODO: 30 DAYS
            uint punishmentPeriod = block.timestamp + 30 days;
            for (uint i = 0; i < votingData.trueVoters.length; i++) {
                votingData.addressPunished[votingData.trueVoters[i]] = punishmentPeriod;
            }

            // Reset voting variables (except punishments)
            _resetVotingData();
        }
    }

    // Function to find the winner by date in a specific block
    function findWinnerByDate(uint _blockId, uint _winningDate) private view returns (address) {
        Block storage blockInfo = bettingEvent.blocks[_blockId];

        // Iterate through all users who bet in this block
        for (uint i = 0; i < blockInfo.betUsers.length; i++) {
            address user = blockInfo.betUsers[i];
            UserBet storage userBet = blockInfo.bets[user];
            
            // Check if this user bet on the winning date
            if (userBet.choice == _winningDate) {
                return user;
            }
        }

        // No user found for this date
        return address(0);
    }

    // Internal helper function to find the winner in all blocks
    function _findWinnerInAllBlocks(uint _winningDate) internal view returns (address) {
        // Search in all event blocks (from 1 to currBlockId)
        for (uint blockId = 1; blockId <= bettingEvent.currBlockId; blockId++) {
            address winner = findWinnerByDate(blockId, _winningDate);
            if (winner != address(0)) {
                return winner; // Return the first winner found
            }
        }
        return address(0); // No winner found
    }

    // Public function to find the winner by date (useful for front-ends)
    function getWinnerByDate(uint _blockId, uint _winningDate) public view returns (address) {
        return findWinnerByDate(_blockId, _winningDate);
    }

    // Function to get information about the prize and winner
    function getPrizeInfo() public view returns (
        bool canWithdraw,
        uint totalPrize,
        uint vaultAmount,
        uint contributionAmount,
        address winner,
        uint winningDate
    ) {
        return (
            winningDateData.eventCompleted,
            bettingEvent.vault + bettingEvent.contributionVault,
            bettingEvent.vault,
            bettingEvent.contributionVault,
            winningDateData.winnerAddress,
            winningDateData.finalWinningDate
        );
    }

    // Internal helper function to reset voting data (keeps punishments)
    function _resetVotingData() private {
        votingData.votingStarted = false;
        votingData.votingStartTimestamp = 0;
        votingData.votingDeadline = 0;
        votingData.votesToEnd = 0;
        votingData.votesAgainstEnd = 0;

        // Clear arrays
        delete votingData.votersList;
        delete votingData.trueVoters;
    }

    // Internal helper function to reset winning date data
    function _resetWinningDateData() private {
        winningDateData.votingStarted = false;
        winningDateData.minTimeForConsensus = 0;

        // Clear proposed dates array (O(1) operation)
        delete winningDateData.proposedDates;

        // NOTE: With the round system, it's not necessary to clear the mappings
        // Old data remains in previous rounds and does not interfere
        // The next vote will use winningDateData.currentRound + 1
    }

    // Auxiliary function to check if a user has already voted in the current round
    function _hasUserVotedInCurrentRound(address _user) private view returns (bool) {
        for (uint i = 0; i < votingData.votersList.length; i++) {
            if (votingData.votersList[i] == _user) {
                return true;
            }
        }
        return false;
    }


    // Function to get voting information
    function getVotingInfo() public view returns (
        bool votingStarted,
        uint votingStartTimestamp,
        uint votingDeadline,
        uint votesToEnd,
        uint votesAgainstEnd,
        uint totalVotes
    ) {
        return (
            votingData.votingStarted,
            votingData.votingStartTimestamp,
            votingData.votingDeadline,
            votingData.votesToEnd,
            votingData.votesAgainstEnd,
            votingData.votesToEnd + votingData.votesAgainstEnd
        );
    }

    // Function to check if a user has already voted
    function hasUserVoted(address _user) public view returns (bool) {
        return _hasUserVotedInCurrentRound(_user);
    }

    // Function to check if a user is punished
    function isUserPunished(address _user) public view returns (bool, uint) {
        uint punishmentEnd = votingData.addressPunished[_user];
        bool isPunished = punishmentEnd > 0 && block.timestamp < punishmentEnd;
        return (isPunished, punishmentEnd);
    }

    // Function to get list of users who voted "true"
    function getTrueVoters() public view returns (address[] memory) {
        return votingData.trueVoters;
    }

    // Function to get list of all voters
    function getAllVoters() public view returns (address[] memory) {
        return votingData.votersList;
    }

    // Function to get voting information for winning date
    function getWinningDateVotingInfo() public view returns (
        bool votingStarted,
        uint votingDeadline,
        uint[] memory proposedDates,
        uint timeRemaining,
        uint currentRound,
        uint eventCompletedTimestamp
    ) {
        uint remaining = 0;
        if (winningDateData.votingStarted && block.timestamp < winningDateData.minTimeForConsensus) {
            remaining = winningDateData.minTimeForConsensus - block.timestamp;
        }
        
        return (
            winningDateData.votingStarted,
            winningDateData.minTimeForConsensus,
            winningDateData.proposedDates,
            remaining,
            winningDateData.currentRound,
            winningDateData.eventCompletedTimestamp
        );
    }

    // Function to check if a user has already voted for winning date in the current round
    function hasUserVotedForWinningDate(address _user) public view returns (bool) {
        // If voting hasn't started, nobody has voted yet
        if (!winningDateData.votingStarted) {
            return false;
        }
        // Check if user voted in the current round (which is >= 1 when voting started)
        return winningDateData.hasVotedRound[_user] == winningDateData.currentRound;
    }

    // Function to get all vote counts for proposed dates in the current round
    function getAllDateVoteCounts() public view returns (uint[] memory dates, uint[] memory voteCounts) {
        uint length = winningDateData.proposedDates.length;
        dates = new uint[](length);
        voteCounts = new uint[](length);
        
        for (uint i = 0; i < length; i++) {
            uint currentDate = winningDateData.proposedDates[i];
            dates[i] = currentDate;
            voteCounts[i] = winningDateData.dateVoteCount[winningDateData.currentRound][currentDate];
        }
        
        return (dates, voteCounts);
    }

    // Function to get vote counts for a specific round
    function getDateVoteCountsByRound(uint _round) public view returns (uint[] memory dates, uint[] memory voteCounts) {
        uint length = winningDateData.proposedDates.length;
        dates = new uint[](length);
        voteCounts = new uint[](length);
        
        for (uint i = 0; i < length; i++) {
            uint currentDate = winningDateData.proposedDates[i];
            dates[i] = currentDate;
            voteCounts[i] = winningDateData.dateVoteCount[_round][currentDate];
        }
        
        return (dates, voteCounts);
    }

    // Auxiliary function to check if a date is valid and available
    function isValidAndAvailableDate(uint _blockId, uint _dateChoice) private view returns (bool) {
        Block storage blockInfo = bettingEvent.blocks[_blockId];
        
        // Check if the date is in the list of available dates
        bool dateExists = false;
        for (uint i = 0; i < blockInfo.availableDates.length; i++) {
            if (blockInfo.availableDates[i] == _dateChoice) {
                dateExists = true;
                break;
            }
        }

        // Return true if the date exists and is not occupied
        return dateExists && !blockInfo.dateOccupied[_dateChoice];
    }

    // Auxiliary function to check if a date choosen as winning date is valid
    function isValidWinningDate(uint _winningDate) private view returns (bool) {
        // Check if the timestamp corresponds to the start of a day (00:00:00 GMT)
        // A valid timestamp must be a multiple of 86400 (seconds in a day)
        if (_winningDate % 86400 != 0) {
            return false;
        }

        // Check if the date is within a reasonable range based on the baseTimestamp
        // The date must be greater than or equal to the baseTimestamp
        if (_winningDate < bettingEvent.baseTimestamp) {
            return false;
        }

        // Check that the winning date is not in the future
        if (_winningDate > block.timestamp) {
            return false;
        }

        return true;
    }

    // Auxiliary function to find the nearest previous date with a bet
    function findNearestPreviousDateWithBet(uint _targetDate) private view returns (uint) {
        uint nearestDate = 0;

        // Search across all blocks of the event (from 1 to currBlockId)
        for (uint blockId = 1; blockId <= bettingEvent.currBlockId; blockId++) {
            Block storage blockInfo = bettingEvent.blocks[blockId];
            
            // Iterate over all users who bet in this block
            for (uint i = 0; i < blockInfo.betUsers.length; i++) {
                address betUser = blockInfo.betUsers[i];
                uint betDate = blockInfo.bets[betUser].choice;

                // Check if the bet date is before or equal to the target date
                // and if it is closer than the date found previously
                if (betDate <= _targetDate && betDate > nearestDate) {
                    nearestDate = betDate;
                }
            }
        }
        
        return nearestDate;
    }

    // Auxiliary function for testing - check if there are available slots in the future
    function checkAvailableSlotsInFuture() public view returns (bool) {
        Block storage currentBlock = bettingEvent.blocks[bettingEvent.currBlockId];

        // Return the current timestamp
        uint currentTimestamp = block.timestamp;

        // Calculate timestamp 5 days in the future
        uint futureThreshold = currentTimestamp + 5 days;

        // Check if there are available dates for betting 5 days in the future
        bool availableSlotsInFuture = true;

        // Check if the last available date in the block is less than or equal to the futureThreshold
        if (currentBlock.availableDates.length > 0) {
            uint lastAvailableDate = currentBlock.availableDates[currentBlock.availableDates.length - 1];

            // If the last available date is less than or equal to the futureThreshold, there are no slots in the future
            if (lastAvailableDate <= futureThreshold) {
                availableSlotsInFuture = false;
            } else {
                // Check if all dates after futureThreshold are occupied
                bool hasAvailableFutureSlots = false;
                
                for (uint i = 0; i < currentBlock.availableDates.length; i++) {
                    uint date = currentBlock.availableDates[i];

                    // Check if the date is greater than futureThreshold and not occupied
                    if (date > futureThreshold && !currentBlock.dateOccupied[date]) {
                        hasAvailableFutureSlots = true;
                        break;
                    }
                }
                
                availableSlotsInFuture = hasAvailableFutureSlots;
            }
        } else {
            // If there are no available dates, there are no slots in the future
            availableSlotsInFuture = false;
        }
        
        return availableSlotsInFuture;
    }


    // Function to get event information
    function getEventInfo() public view returns (
        address eventOwner,
        string memory eventDescription,
        uint currentBetValue,
        uint currentSFactor,
        uint currentBlockId,
        uint currentBets,
        uint vault,
        uint contributionVault,
        bool isEventOpen,
        uint baseTimestamp
    ) {
        return (
            bettingEvent.owner,
            bettingEvent.description,
            bettingEvent.currBetValue,
            bettingEvent.currSFactor,
            bettingEvent.currBlockId,
            bettingEvent.currBets,
            bettingEvent.vault,
            bettingEvent.contributionVault,
            bettingEvent.isOpen,
            bettingEvent.baseTimestamp
        );
    }

    // Function to get information about a specific block
    function getBlockInfo(uint _blockId) public view returns (
        uint blockId,
        uint blockBetValue,
        uint blockSFactor,
        uint blockSize,
        uint[] memory availableDates,
        uint[] memory availableDatesForBetting, // New available dates for betting
        address[] memory users,
        bool isBlockOpen
    ) {
        Block storage blockInfo = bettingEvent.blocks[_blockId];

        // Calculate available dates for betting (not occupied)
        uint[] memory tempAvailable = new uint[](blockInfo.availableDates.length);
        uint count = 0;
        
        for (uint i = 0; i < blockInfo.availableDates.length; i++) {
            if (!blockInfo.dateOccupied[blockInfo.availableDates[i]]) {
                tempAvailable[count] = blockInfo.availableDates[i];
                count++;
            }
        }

        // Create array with exact size for available dates
        uint[] memory unBetDates = new uint[](count);
        for (uint i = 0; i < count; i++) {
            unBetDates[i] = tempAvailable[i];
        }
        
        return (
            blockInfo.id,
            blockInfo.betValue,
            blockInfo.sFactor,
            blockInfo.blockSize,
            blockInfo.availableDates, // All dates in the block
            unBetDates, // Only available dates for betting
            blockInfo.betUsers,
            blockInfo.isOpen
        );
    }

    // Function to generate sequential Unix timestamps
    function generateTimestamp(uint baseTimestamp, uint daysOffset) private pure returns (uint[] memory) {

        // Create an array of dates
        uint[] memory timestamps = new uint[](daysOffset);
        for (uint i = 0; i < daysOffset; i++) {
            timestamps[i] = baseTimestamp + (i * 1 days);
        }
        return timestamps;
    }

    // Auxiliary function to adjust blockSize based on occupancy rate
    function adjustBlockSize(uint _blockId) private view returns (uint) {

        // Current block
        Block storage blockInfo = bettingEvent.blocks[_blockId];
        // Array of possible values for blockSize
        uint[] memory blockSizeValues = new uint[](8);
        blockSizeValues[0] = 5;
        blockSizeValues[1] = 6;
        blockSizeValues[2] = 8;
        blockSizeValues[3] = 11;
        blockSizeValues[4] = 14;
        blockSizeValues[5] = 18;
        blockSizeValues[6] = 24;
        blockSizeValues[7] = 32;

        // Find current index of blockSize
        uint currentIndex = 0;
        for (uint i = 0; i < blockSizeValues.length; i++) {
            if (blockSizeValues[i] == blockInfo.blockSize) {
                currentIndex = i;
                break;
            }
        }

        uint occupancyRate = (blockInfo.betUsers.length * 100) / blockInfo.blockSize;
        uint newBlockSize = blockInfo.blockSize;

        if (occupancyRate < 50 && currentIndex < blockSizeValues.length - 1) {
            newBlockSize = blockSizeValues[currentIndex + 1];
        } else if (occupancyRate > 85 && currentIndex > 0) {
            newBlockSize = blockSizeValues[currentIndex - 1];
        }

        return newBlockSize;
    }

    // Auxiliary function to calculate new betValue and sFactor based on demand
    function adjustBetValue(uint _blockId) private view returns (uint newBetValue, uint newSFactor) {
        // Event data
        Event storage eventInfo = bettingEvent;
        // Current block
        Block storage blockInfo = eventInfo.blocks[_blockId];

        uint occupancyRate = (blockInfo.betUsers.length * 100) / blockInfo.blockSize;

        if (occupancyRate > 70) {
            // High betting demand: betValue increases more and sFactor also increases
            newBetValue = eventInfo.currBetValue + eventInfo.currSFactor + eventInfo.sFactorInitial;
            newSFactor = eventInfo.currSFactor + eventInfo.sFactorInitial;
        } else {
            // Normal demand: betValue increases only with block's sFactor
            newBetValue = eventInfo.currBetValue + eventInfo.currSFactor;
            newSFactor = eventInfo.currSFactor;
        }

        return (newBetValue, newSFactor);
    }

    // Function to get the chosen date and registration_date for a specific user in a block
    function getUserChoice(uint _blockId, address _user) public view returns (uint choice, uint registrationDate) {
        require(_blockId <= bettingEvent.currBlockId, "Block ID does not exist");
        
        Block storage blockInfo = bettingEvent.blocks[_blockId];
        UserBet storage userBet = blockInfo.bets[_user];
        
        require(userBet.user == _user, "User has no bet in this block");
        
        return (userBet.choice, userBet.registration_date);
    }

}