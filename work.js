let web3;
let userAccount;
let selectedTipAmount = 0.001;
let currentChainId;
let contractInstance;
let sessionStats = {
    totalTips: 0,
    totalValue: 0,
    gasSaved: 0
};

// Smart Contract Configuration
const CONTRACT_ABI = [
    {
        "inputs": [{"type": "address", "name": "recipient"}, {"type": "string", "name": "message"}],
        "name": "sendTip",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "withdrawTips", 
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"type": "address", "name": "recipient"}],
        "name": "getRecipientStats",
        "outputs": [{"type": "tuple", "components": [
            {"type": "uint256", "name": "totalReceived"},
            {"type": "uint256", "name": "tipCount"},
            {"type": "uint256", "name": "withdrawnAmount"}
        ]}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"type": "address", "name": "recipient"}],
        "name": "getPendingWithdrawal",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [
            {"indexed": true, "type": "address", "name": "sender"},
            {"indexed": true, "type": "address", "name": "recipient"},
            {"type": "uint256", "name": "amount"},
            {"type": "string", "name": "message"},
            {"type": "uint256", "name": "timestamp"},
            {"type": "bool", "name": "sponsored"}
        ],
        "name": "TipSent",
        "type": "event"
    }
];

// Contract addresses for different networks
const CONTRACT_ADDRESSES = {
    '0xaa36a7': '0xF31707AB51F3A133b1F945127E05C78d5c6585a6', // Sepolia - replace with deployed address
    '0x4e454': '0x742d35Cc6634C0532925a3b8D9c8AC23D4bE4c7b'   // NERO Chain - replace with deployed address
};

// Network configurations
const NERO_CHAIN_CONFIG = {
    chainId: '0x2b1',
    chainName: 'NERO Testnet',
    nativeCurrency: {
        name: 'NERO',
        symbol: 'NERO',
        decimals: 18
    },
    rpcUrls: ['https://rpc-testnet.nerochain.io'],
    blockExplorerUrls: ['https://testnet.neroscan.io']
};

const SEPOLIA_CONFIG = {
    chainId: '0xaa36a7',
    chainName: 'Sepolia Test Network',
    nativeCurrency: {
        name: 'SepoliaETH',
        symbol: 'ETH',
        decimals: 18
    },
    rpcUrls: ['https://sepolia.infura.io/v3/'],
    blockExplorerUrls: ['https://sepolia.etherscan.io']
};

const RECIPIENT_ADDRESS = '0xF3c4262155D066Bc190CA3847512B92447CE9b30';
const PAYMASTER_THRESHOLD = 0.02;
const ESTIMATED_GAS_COST_USD = 2.50;

function initializeContract() {
    const contractAddress = CONTRACT_ADDRESSES[currentChainId];
    if (contractAddress && window.ethereum) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        contractInstance = new ethers.Contract(contractAddress, CONTRACT_ABI, provider.getSigner());
        logTransaction(`📄 Contract initialized at ${contractAddress}`, 'info');
    }
}

function updateDebugInfo() {
    const debugText = document.getElementById('debugText');
    const contractAddress = CONTRACT_ADDRESSES[currentChainId] || 'Not deployed';
    debugText.innerHTML = `
        MetaMask Present: ${!!window.ethereum}<br>
        Current Chain: ${currentChainId || 'Not connected'}<br>
        Connected Account: ${userAccount ? `${userAccount.substring(0, 6)}...${userAccount.substring(38)}` : 'None'}<br>
        Contract Address: ${contractAddress}<br>
        Paymaster Threshold: ${PAYMASTER_THRESHOLD} ETH<br>
        Selected Tip: ${selectedTipAmount} ETH (${selectedTipAmount <= PAYMASTER_THRESHOLD ? 'SPONSORED' : 'PAYS GAS'})<br>
        Session Stats: ${sessionStats.totalTips} tips, ${sessionStats.totalValue.toFixed(4)} ETH<br>
        Timestamp: ${new Date().toLocaleTimeString()}
    `;
}

function updateStats() {
    document.getElementById('totalTips').textContent = sessionStats.totalTips;
    document.getElementById('totalValue').textContent = sessionStats.totalValue.toFixed(4);
    document.getElementById('gasSaved').textContent = `$${sessionStats.gasSaved.toFixed(2)}`;
}

function updateGasEstimate() {
    const gasEstimate = document.getElementById('gasEstimate');
    const gasEstimateText = document.getElementById('gasEstimateText');
    const gasSavings = document.getElementById('gasSavings');
    const savingsAmount = document.getElementById('savingsAmount');

    if (selectedTipAmount <= PAYMASTER_THRESHOLD) {
        gasEstimateText.textContent = '✨ FREE - Sponsored by NERO paymaster';
        gasSavings.style.display = 'block';
        savingsAmount.textContent = `$${ESTIMATED_GAS_COST_USD.toFixed(2)}`;
    } else {
        gasEstimateText.textContent = `⚡ ~$${ESTIMATED_GAS_COST_USD.toFixed(2)} - User pays gas`;
        gasSavings.style.display = 'none';
    }
    
    gasEstimate.style.display = 'block';
}

async function switchToNeroChain() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: NERO_CHAIN_CONFIG.chainId }],
        });
    } catch (switchError) {
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [NERO_CHAIN_CONFIG],
                });
                logTransaction('🎉 NERO Chain added to MetaMask!', 'success');
            } catch (addError) {
                logTransaction('❌ Failed to add NERO Chain. Using Sepolia for development.', 'error');
                await switchToSepolia();
            }
        } else {
            logTransaction('❌ Network switch failed. Using current network.', 'error');
        }
    }
}

async function switchToSepolia() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: SEPOLIA_CONFIG.chainId }],
        });
    } catch (error) {
        logTransaction('❌ Failed to switch to Sepolia', 'error');
    }
}

async function connectWallet() {
    const connectButton = document.getElementById('connectButton');
    const statusText = document.getElementById('statusText');
    const walletInfo = document.getElementById('walletInfo');
    const walletStatus = document.getElementById('walletStatus');

    try {
        if (!window.ethereum) {
            throw new Error('MetaMask is not installed. Please install MetaMask extension.');
        }

        connectButton.innerHTML = '<div class="loading"></div>Connecting...';
        connectButton.disabled = true;

        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        userAccount = accounts[0];
        web3 = window.ethereum;

        currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        
        const balance = await window.ethereum.request({
            method: 'eth_getBalance',
            params: [userAccount, 'latest']
        });

        const balanceInEth = parseInt(balance, 16) / Math.pow(10, 18);

        // Initialize contract
        initializeContract();
        
        // Load recipient stats if contract is available
        await loadRecipientStats();

        updateNetworkStatus();

        statusText.textContent = 'Connected to MetaMask';
        walletInfo.innerHTML = `
            <div style="margin-top: 10px; font-size: 14px;">
                <strong>Address:</strong> ${userAccount.substring(0, 6)}...${userAccount.substring(38)}<br>
                <strong>Balance:</strong> ${balanceInEth.toFixed(4)} ETH<br>
                <strong>Network:</strong> Chain ID ${currentChainId}
            </div>
        `;
        walletStatus.className = 'wallet-status connected';
        connectButton.style.display = 'none';

        logTransaction('✅ Wallet connected successfully!', 'success');
        updateDebugInfo();
        updateGasEstimate();

    } catch (error) {
        console.error('Connection failed:', error);
        statusText.textContent = 'Connection failed';
        walletStatus.className = 'wallet-status error';
        walletInfo.innerHTML = `
            <div style="margin-top: 10px; color: #d32f2f;">
                <strong>Error:</strong> ${error.message}
            </div>
        `;
        connectButton.innerHTML = 'Retry Connection';
        connectButton.disabled = false;
        
        logTransaction(`❌ Connection failed: ${error.message}`, 'error');
    }
}

async function loadRecipientStats() {
    if (!contractInstance || !RECIPIENT_ADDRESS) return;
    
    try {
        const stats = await contractInstance.getRecipientStats(RECIPIENT_ADDRESS);
        const pendingWithdrawal = await contractInstance.getPendingWithdrawal(RECIPIENT_ADDRESS);
        
        logTransaction(`📊 Recipient stats loaded: ${ethers.utils.formatEther(stats.totalReceived)} ETH received (${stats.tipCount.toString()} tips)`, 'info');
        
        if (pendingWithdrawal.gt(0)) {
            logTransaction(`💰 Pending withdrawal: ${ethers.utils.formatEther(pendingWithdrawal)} ETH`, 'info');
        }
    } catch (error) {
        console.error('Failed to load recipient stats:', error);
        logTransaction('⚠️ Could not load recipient stats', 'error');
    }
}

function updateNetworkStatus() {
    const networkStatus = document.getElementById('networkStatus');
    const networkText = document.getElementById('networkText');
    const switchBtn = document.getElementById('switchNetworkBtn');

    if (currentChainId === NERO_CHAIN_CONFIG.chainId) {
        networkText.textContent = '🟢 Connected to NERO Chain Testnet';
        networkStatus.style.background = 'linear-gradient(135deg, #4caf50, #8bc34a)';
        switchBtn.style.display = 'none';
    } else if (currentChainId === SEPOLIA_CONFIG.chainId) {
        networkText.textContent = '🟡 Connected to Sepolia (Development Mode)';
        networkStatus.style.background = 'linear-gradient(135deg, #ff9800, #f57c00)';
        switchBtn.style.display = 'inline-block';
        switchBtn.textContent = 'Switch to NERO';
    } else {
        networkText.textContent = '🔴 Wrong Network - Please switch to supported network';
        networkStatus.style.background = 'linear-gradient(135deg, #f44336, #d32f2f)';
        switchBtn.style.display = 'inline-block';
        switchBtn.textContent = 'Switch Network';
    }
}

function showTipOptions() {
    const tipOptions = document.getElementById('tipOptions');
    tipOptions.style.display = tipOptions.style.display === 'none' ? 'flex' : 'none';
    if (tipOptions.style.display === 'flex') {
        updateGasEstimate();
    }
}

function selectTipAmount(amount) {
    selectedTipAmount = amount;
    document.getElementById('selectedAmount').textContent = `${amount} ETH`;
    document.getElementById('customTipInput').value = '';
    
    updatePaymasterBadge();
    updateGasEstimate();
    
    document.querySelectorAll('.tip-option').forEach(option => {
        option.classList.remove('selected');
    });
    event.target.classList.add('selected');

    updateDebugInfo();
}

function setCustomTip() {
    const customInput = document.getElementById('customTipInput');
    const amount = parseFloat(customInput.value);
    
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid tip amount');
        return;
    }
    
    if (amount > 1) {
        alert('Maximum tip amount is 1 ETH for this demo');
        return;
    }
    
    selectedTipAmount = amount;
    document.getElementById('selectedAmount').textContent = `${amount} ETH`;
    
    updatePaymasterBadge();
    updateGasEstimate();
    
    document.querySelectorAll('.tip-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    updateDebugInfo();
}

function updatePaymasterBadge() {
    const badge = document.getElementById('paymasterBadge');
    if (selectedTipAmount <= PAYMASTER_THRESHOLD) {
        badge.textContent = '✨ Gas-Free Zone!';
        badge.style.background = 'linear-gradient(135deg, #4caf50, #8bc34a)';
    } else {
        badge.textContent = '⚡ User Pays Gas';
        badge.style.background = 'linear-gradient(135deg, #ff9800, #f57c00)';
    }
}

async function sendTip() {
    if (!userAccount) {
        alert('Please connect your wallet first');
        return;
    }

    if (!contractInstance) {
        alert('Smart contract not available on this network');
        return;
    }

    const sendButton = document.getElementById('sendTipText');
    const originalText = sendButton.textContent;

    try {
        sendButton.innerHTML = '<div class="loading"></div>Sending...';

        const isSponsored = selectedTipAmount <= PAYMASTER_THRESHOLD;
        const amountInWei = ethers.utils.parseEther(selectedTipAmount.toString());
        
        if (isSponsored) {
            logTransaction(`🎉 This ${selectedTipAmount} ETH tip will be sponsored by NERO paymaster!`, 'info');
        }

        if (currentChainId === NERO_CHAIN_CONFIG.chainId) {
            logTransaction('🚀 Using NERO Chain paymaster system...', 'info');
        }

        // Call smart contract
        const tx = await contractInstance.sendTip(
            RECIPIENT_ADDRESS,
            `Tip from ${userAccount.substring(0, 6)}...${userAccount.substring(38)}`,
            { value: amountInWei }
        );

        logTransaction(`⏳ Transaction submitted: ${tx.hash.substring(0, 10)}...${tx.hash.substring(56)}`, 'info');

        // Wait for confirmation
        const receipt = await tx.wait();
        
        // Update session stats
        sessionStats.totalTips += 1;
        sessionStats.totalValue += selectedTipAmount;
        if (isSponsored) {
            sessionStats.gasSaved += ESTIMATED_GAS_COST_USD;
        }

        updateStats();

        logTransaction(`✅ Tip sent successfully! ${selectedTipAmount} ETH (Block: ${receipt.blockNumber})`, 'success');

        if (isSponsored) {
            logTransaction(`💝 Gas fees sponsored by NERO paymaster - User paid $0 in fees!`, 'success');
        } else {
            logTransaction(`⚡ User paid gas fees (tip exceeds ${PAYMASTER_THRESHOLD} ETH threshold)`, 'info');
        }

        // Parse events from transaction receipt
        const tipSentEvent = receipt.events?.find(event => event.event === 'TipSent');
        if (tipSentEvent) {
            logTransaction(`📝 Event: TipSent - Amount: ${ethers.utils.formatEther(tipSentEvent.args.amount)} ETH`, 'info');
        }

        document.getElementById('tipOptions').style.display = 'none';

        // Reload recipient stats
        await loadRecipientStats();

    } catch (error) {
        console.error('Transaction failed:', error);
        let errorMessage = error.message;
        
        // Handle common errors
        if (error.code === 4001) {
            errorMessage = 'Transaction rejected by user';
        } else if (error.code === -32603) {
            errorMessage = 'Insufficient funds for gas';
        }
        
        logTransaction(`❌ Transaction failed: ${errorMessage}`, 'error');
    } finally {
        sendButton.textContent = originalText;
    }
}

function logTransaction(message, type) {
    const transactionList = document.getElementById('transactionList');
    
    if (transactionList.innerHTML.includes('No transactions yet')) {
        transactionList.innerHTML = '';
    }

    const transactionItem = document.createElement('div');
    transactionItem.className = 'transaction-item';
    
    const timestamp = new Date().toLocaleTimeString();
    transactionItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>${message}</span>
            <small style="color: #666;">${timestamp}</small>
        </div>
    `;

    if (type === 'error') {
        transactionItem.style.borderLeftColor = '#f44336';
    } else if (type === 'success') {
        transactionItem.style.borderLeftColor = '#4caf50';
    } else if (type === 'info') {
        transactionItem.style.borderLeftColor = '#2196f3';
    }

    transactionList.insertBefore(transactionItem, transactionList.firstChild);
    
    // Limit to 10 most recent transactions
    if (transactionList.children.length > 10) {
        transactionList.removeChild(transactionList.lastChild);
    }
}

// Initialize on page load
window.addEventListener('load', () => {
    updateDebugInfo();
    updateStats();
    
    // Load ethers.js
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js';
    script.onload = () => {
        logTransaction('📚 Ethers.js loaded successfully', 'info');
    };
    document.head.appendChild(script);
    
    setTimeout(() => {
        const statusText = document.getElementById('statusText');
        const connectButton = document.getElementById('connectButton');
        
        if (window.ethereum) {
            statusText.textContent = 'MetaMask detected - Ready to connect';
            connectButton.disabled = false;
        } else {
            statusText.textContent = 'MetaMask not found - Please install MetaMask';
            connectButton.textContent = 'Install MetaMask';
            connectButton.onclick = () => window.open('https://metamask.io/download/', '_blank');
        }
        
        updateDebugInfo();
    }, 1000);
});

// Listen for MetaMask events
if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            location.reload();
        } else {
            connectWallet();
        }
    });

    window.ethereum.on('chainChanged', (chainId) => {
        currentChainId = chainId;
        initializeContract();
        updateNetworkStatus();
        updateDebugInfo();
        logTransaction(`🔄 Network changed to Chain ID: ${chainId}`, 'info');
    });
}

// Auto-update debug info every 10 seconds
setInterval(updateDebugInfo, 10000);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'customTipInput') {
        setCustomTip();
    }
});

// Enhanced error handling
window.addEventListener('error', (e) => {
    logTransaction(`⚠️ JavaScript Error: ${e.message}`, 'error');
});

// Add withdrawal function for recipients
async function withdrawTips() {
    if (!contractInstance || !userAccount) {
        alert('Please connect your wallet first');
        return;
    }

    try {
        logTransaction('💰 Initiating tip withdrawal...', 'info');
        const tx = await contractInstance.withdrawTips();
        const receipt = await tx.wait();
        
        logTransaction(`✅ Tips withdrawn successfully! (Block: ${receipt.blockNumber})`, 'success');
        await loadRecipientStats();
    } catch (error) {
        console.error('Withdrawal failed:', error);
        logTransaction(`❌ Withdrawal failed: ${error.message}`, 'error');
    }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        connectWallet,
        sendTip,
        withdrawTips,
        selectTipAmount,
        setCustomTip
    };
}