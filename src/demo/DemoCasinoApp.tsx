import { useState, useEffect, useRef, lazy, Suspense, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createFileRoute } from "@tanstack/react-router";
import { ThemeContext } from '@/contexts/ThemeContext';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BTCWalletConnect } from '@/components/BTCWalletConnect';
import { BalanceDisplay } from '@/components/BalanceDisplay';
import { GameHistory } from '@/components/GameHistory';
import { GameStats } from '@/components/GameStats';
import { TransactionHistory } from '@/components/TransactionHistory';
import { AutoBet, type AutoBetConfig } from '@/components/AutoBet';
import { FairnessVerification } from '@/components/FairnessVerification';
import { DepositDialog } from '@/components/DepositDialog';
import { SoundToggle } from '@/components/SoundToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RecentResults } from '@/components/RecentResults';
import { PlayerStats } from '@/components/PlayerStats';
import { Leaderboard } from '@/components/Leaderboard';
import { Achievements } from '@/components/Achievements';
import { DailyMissions } from '@/components/DailyMissions';
import { PlayerLevel } from '@/components/PlayerLevel';
import { LiveActivityFeed } from '@/components/LiveActivityFeed';
import { SettingsPortal } from '@/components/SettingsPortal';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import { ResponsibleGamingModal } from '@/components/ResponsibleGamingModal';
import { ArcadePassModal } from '@/components/ArcadePassModal';
import { WelcomeOfferModal } from '@/components/WelcomeOfferModal';
import { KycStatusBadge } from '@/components/KycStatusBadge';
import { KycVerificationDialog } from '@/components/KycVerificationDialog';
import { NotificationCenter } from '@/components/NotificationCenter';
import { Button } from '@/components/ui/button';
import { useWallet, useWalletBalances, useUserWallets, useDeposit } from '@/hooks/useWallet';
import { useBTCWallet } from '@/hooks/useBTCWallet';
import { usePlaceBet, useGameSessions, useInitializeSeeds, useSessionForVerification, useUserTransactions } from '@/hooks/useGame';
import { createConfetti } from '@/lib/confetti';
import { Dice1, History, Shield, BarChart3, Zap, Cherry, Flame, Circle as CircleIcon, Target, Trophy, Award, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute("/")({
	component: App,
});

const DiceGame = lazy(() => import('@/components/DiceGame').then(m => ({ default: m.DiceGame })));
const SlotsGame = lazy(() => import('@/components/SlotsGame').then(m => ({ default: m.SlotsGame })));
const BalloonGame = lazy(() => import('@/components/BalloonGame').then(m => ({ default: m.BalloonGame })));
const PlinkoGame = lazy(() => import('@/components/PlinkoGame').then(m => ({ default: m.PlinkoGame })));
const RouletteGame = lazy(() => import('@/components/RouletteGame').then(m => ({ default: m.RouletteGame })));

function App() {
	const { currentUser: btcUser, btcAddress, isConnected: btcConnected, isConnecting: btcConnecting, connectionError: btcError, connectWallet: connectBTC, disconnectWallet: disconnectBTC, walletStatus } = useBTCWallet();

	// Use BTC user context
	const currentUser = btcUser;
	const isConnected = btcConnected;
	const isConnecting = btcConnecting;
	const connectionError = btcError;
	const connectWallet = connectBTC;
	const disconnectWallet = disconnectBTC;

	const [selectedCurrency, setSelectedCurrency] = useState('BTC');
	const [depositDialogOpen, setDepositDialogOpen] = useState(false);
	const [rgModalOpen, setRgModalOpen] = useState(false);
	const [arcadePassModalOpen, setArcadePassModalOpen] = useState(false);
	const [welcomeModalOpen, setWelcomeModalOpen] = useState(true); // Default to open for demo
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState('dice');
	const [isAutoBetting, setIsAutoBetting] = useState(false);
	const [autoBetConfig, setAutoBetConfig] = useState<AutoBetConfig | null>(null);
	const [autoBetCount, setAutoBetCount] = useState(0);
	const autoBetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const previousSessionCountRef = useRef<number>(0);
	const [kycDialogOpen, setKycDialogOpen] = useState(false);
	const themeContext = useContext(ThemeContext);

	useEffect(() => {
		if (themeContext) {
			switch (activeTab) {
				case 'dice':
					themeContext.setTheme('dice');
					break;
				case 'plinko':
					themeContext.setTheme('plinko');
					break;
				case 'roulette':
					themeContext.setTheme('roulette');
					break;
				case 'slots':
					themeContext.setTheme('slots');
					break;
				case 'zen':
					themeContext.setTheme('zen');
					break;
				default:
					themeContext.setTheme('default');
			}
		}
	}, [activeTab, themeContext]);

	// Queries
	const { data: wallets = [] } = useUserWallets(currentUser?.id || null);
	const { data: currentWallet } = useWalletBalances(currentUser?.id || null, 'BTC');
	const { data: gameSessions = [] } = useGameSessions(currentUser?.id || null);
	const { data: transactions = [] } = useUserTransactions(currentUser?.id || null, 200);
	const { data: verificationData } = useSessionForVerification(selectedSessionId);

	// Mutations
	const placeBetMutation = usePlaceBet();
	const depositMutation = useDeposit();
	const initSeedsMutation = useInitializeSeeds();

	// Initialize server seeds on mount
	useEffect(() => {
		if (isConnected && currentUser) {
			initSeedsMutation.mutate();
		}
	}, [isConnected, currentUser]);

	// Track session changes for notifications
	useEffect(() => {
		if (gameSessions.length > previousSessionCountRef.current && previousSessionCountRef.current > 0) {
			const latestSession = gameSessions[0];
			const isWin = latestSession.status === 2; // WON
			const amount = parseFloat(latestSession.win_amount || '0');

			if (isWin && amount > 0) {
				toast.success('You Won!', {
					description: `+${amount.toFixed(8)} ${selectedCurrency}`,
					duration: 3000,
				});
				createConfetti();
			} else {
				toast.error('You Lost', {
					description: `Better luck next time!`,
					duration: 2000,
				});
			}
		}
		previousSessionCountRef.current = gameSessions.length;
	}, [gameSessions, selectedCurrency]);

	const handlePlaceBet = async (betAmount: string, target: number) => {
		if (!currentUser) {
			toast.error('Wallet not connected', { description: 'Please connect your wallet first' });
			return;
		}

		// Validate bet amount
		const betAmountNum = parseFloat(betAmount);
		if (betAmountNum <= 0 || isNaN(betAmountNum)) {
			toast.error('Invalid bet amount', { description: 'Please enter a valid bet amount' });
			return;
		}

		// Check balance
		const balance = parseFloat(currentWallet?.available_balance || '0');
		if (betAmountNum > balance) {
			toast.error('Insufficient balance', {
				description: `Available: ${balance.toFixed(8)} ${selectedCurrency}`
			});
			return;
		}

		// Generate random client seed
		const clientSeed = Math.random().toString(36).substring(2, 15);

		try {
			await placeBetMutation.mutateAsync({
				userId: currentUser.id,
				betAmount,
				currency: selectedCurrency,
				clientSeed,
				target,
			});
		} catch (error) {
			console.error('Failed to place bet:', error);
			const errorMessage = error instanceof Error ? error.message : 'Failed to place bet. Please try again.';
			toast.error('Bet failed', { description: errorMessage });
		}
	};

	const handleDeposit = async (amount: string) => {
		if (!currentUser) return;

		try {
			await depositMutation.mutateAsync({
				userId: currentUser.id,
				currency: selectedCurrency,
				amount,
			});
			setDepositDialogOpen(false);
			toast.success('Deposit successful', {
				description: `Added ${amount} ${selectedCurrency} to your balance`
			});
		} catch (error) {
			console.error('Failed to deposit:', error);
			toast.error('Deposit failed', { description: 'Please try again.' });
		}
	};

	const handleStartAutoBet = (config: AutoBetConfig) => {
		setAutoBetConfig(config);
		setIsAutoBetting(true);
		setAutoBetCount(0);
		toast.info('Auto-bet started', {
			description: `Running ${config.numberOfBets} bets`
		});
	};

	const handleStopAutoBet = () => {
		setIsAutoBetting(false);
		setAutoBetConfig(null);
		if (autoBetTimeoutRef.current) {
			clearTimeout(autoBetTimeoutRef.current);
		}
		toast.info('Auto-bet stopped', {
			description: `Completed ${autoBetCount} bets`
		});
	};

	// Auto-bet logic
	useEffect(() => {
		if (!isAutoBetting || !autoBetConfig || placeBetMutation.isPending) return;

		// Check if we should continue
		if (autoBetCount >= autoBetConfig.numberOfBets) {
			handleStopAutoBet();
			return;
		}

		// Check stop conditions
		if (gameSessions.length > 0 && autoBetCount > 0) {
			const lastSession = gameSessions[0];
			const isWin = lastSession.status === 2;
			const winAmount = parseFloat(lastSession.win_amount || '0');
			const betAmount = parseFloat(lastSession.bet_amount || '0');
			const profit = winAmount - betAmount;

			if (autoBetConfig.stopOnWin && isWin) {
				if (!autoBetConfig.stopOnWinAmount || winAmount >= autoBetConfig.stopOnWinAmount) {
					handleStopAutoBet();
					return;
				}
			}

			if (autoBetConfig.stopOnLoss && !isWin) {
				if (!autoBetConfig.stopOnLossAmount || Math.abs(profit) >= autoBetConfig.stopOnLossAmount) {
					handleStopAutoBet();
					return;
				}
			}
		}

		// Calculate bet amount with progressive betting
		let currentBetAmount = parseFloat(autoBetConfig.baseBetAmount);

		if (gameSessions.length > 0 && autoBetCount > 0) {
			const lastSession = gameSessions[0];
			const isWin = lastSession.status === 2;

			if (autoBetConfig.increaseOnWin && isWin) {
				currentBetAmount *= (1 + autoBetConfig.increasePercentage / 100);
			}

			if (autoBetConfig.increaseOnLoss && !isWin) {
				currentBetAmount *= (1 + autoBetConfig.increasePercentage / 100);
			}
		}

		// Execute next bet after a short delay
		autoBetTimeoutRef.current = setTimeout(async () => {
			try {
				await handlePlaceBet(currentBetAmount.toString(), autoBetConfig.target);
				setAutoBetCount(prev => prev + 1);
			} catch (error) {
				console.error('Auto-bet failed:', error);
				handleStopAutoBet();
			}
		}, 500); // 500ms delay between bets for better UX

		return () => {
			if (autoBetTimeoutRef.current) {
				clearTimeout(autoBetTimeoutRef.current);
			}
		};
	}, [isAutoBetting, autoBetConfig, autoBetCount, gameSessions, placeBetMutation.isPending]);

	const handleVerifySession = (sessionId: string) => {
		setSelectedSessionId(sessionId);
		setActiveTab('verify');
	};

	const lastSession = gameSessions[0];

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto p-6 max-w-7xl">
				{/* Header */}
				<motion.div
					className="mb-8"
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					<div className="flex items-center gap-3 mb-2">
						<motion.div
							animate={{
								rotate: [0, 360],
								scale: [1, 1.1, 1],
							}}
							transition={{
								rotate: { duration: 20, repeat: Number.POSITIVE_INFINITY, ease: 'linear' },
								scale: { duration: 2, repeat: Number.POSITIVE_INFINITY, repeatType: 'reverse' },
							}}
						>
							<Dice1 className="w-8 h-8 text-primary" />
						</motion.div>
						<h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
							Provably Fair Casino
						</h1>
					</div>
					<div className="text-muted-foreground flex justify-between items-center">
						<div className="flex items-center gap-3">
							<div id="player-level-display"><PlayerLevel onClick={() => setArcadePassModalOpen(true)} /></div>
							{currentUser && (
								<KycStatusBadge
									level={currentUser.kyc_level}
									isBanned={currentUser.is_banned}
									onClick={() => setKycDialogOpen(true)}
								/>
							)}
						</div>
						<div className="flex items-center gap-2">
							<Button id="responsible-gaming-button" variant="outline" size="sm" onClick={() => setRgModalOpen(true)}>
								<Shield className="w-4 h-4 mr-2" />
								Responsible Gaming
							</Button>
							<NotificationCenter sessions={gameSessions} currency={selectedCurrency} />
							<SoundToggle />
							<ThemeToggle />
						</div>
					</div>
				</motion.div>

				{/* Bitcoin Wallet Connection */}
				<motion.div
					className="mb-6"
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.4, delay: 0.1 }}
				>
					<BTCWalletConnect
						isConnected={isConnected}
						btcAddress={btcAddress}
						onConnect={connectWallet}
						onDisconnect={disconnectWallet}
						isConnecting={isConnecting}
						error={connectionError}
						walletStatus={walletStatus}
					/>
				</motion.div>

				<AnimatePresence mode="wait">
					{!isConnected ? (
						<motion.div
							key="not-connected"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -20 }}
							transition={{ duration: 0.4 }}
							className="text-center py-12"
						>
							<motion.div
								animate={{
									y: [0, -10, 0],
									rotate: [0, 5, -5, 0],
								}}
								transition={{
									duration: 3,
									repeat: Number.POSITIVE_INFINITY,
									repeatType: 'reverse',
								}}
							>
								<Dice1 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
							</motion.div>
							<motion.p
								className="text-xl text-muted-foreground mb-2"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.2 }}
							>
								Connect your wallet to start playing
							</motion.p>
							<motion.p
								className="text-sm text-muted-foreground"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.3 }}
							>
								Experience provably fair gaming with cryptographic verification
							</motion.p>
						</motion.div>
					) : (
						<motion.div
							key="connected"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.5 }}
						>
							{/* Balance */}
							<motion.div
								className="mb-6"
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.4, delay: 0.2 }}
							>
								<div id="wallet-balance-display">
									<BalanceDisplay
										wallets={wallets}
										selectedCurrency={selectedCurrency}
										onCurrencyChange={setSelectedCurrency}
										onDeposit={() => setDepositDialogOpen(true)}
									/>
								</div>
							</motion.div>

							{/* Main Content */}
							<motion.div
								className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-5 gap-6"
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.4, delay: 0.3 }}
							>
								<div className="lg:col-span-3 xl:col-span-4">
									<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
										<TabsList id="main-game-tabs" className="grid w-full grid-cols-3 sm:grid-cols-9 md:grid-cols-12 gap-1">
											<TabsTrigger value="dice" className="text-xs">
												<Dice1 className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Dice</span>
											</TabsTrigger>
											<TabsTrigger value="slots" className="text-xs">
												<Cherry className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Slots</span>
											</TabsTrigger>
											<TabsTrigger value="balloon" className="text-xs">
												<Flame className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Balloon</span>
											</TabsTrigger>
											<TabsTrigger value="plinko" className="text-xs">
												<CircleIcon className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Plinko</span>
											</TabsTrigger>
											<TabsTrigger value="roulette" className="text-xs">
												<Target className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Roulette</span>
											</TabsTrigger>
											<TabsTrigger value="auto" className="text-xs">
												<Zap className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Auto</span>
											</TabsTrigger>
											<TabsTrigger value="stats" className="text-xs">
												<BarChart3 className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Stats</span>
											</TabsTrigger>
											<TabsTrigger value="history" className="text-xs">
												<History className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">History</span>
											</TabsTrigger>
											<TabsTrigger value="verify" className="text-xs">
												<Shield className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Verify</span>
											</TabsTrigger>
											<TabsTrigger value="leaderboard" className="text-xs">
												<Trophy className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Leaderboard</span>
											</TabsTrigger>
											<TabsTrigger value="achievements" className="text-xs">
												<Award className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Achievements</span>
											</TabsTrigger>
											<TabsTrigger value="missions" className="text-xs">
												<Star className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Missions</span>
											</TabsTrigger>
											<TabsTrigger value="settings" className="text-xs">
												<Shield className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Settings</span>
											</TabsTrigger>
											<TabsTrigger value="zen" className="text-xs">
												<CircleIcon className="w-4 h-4 mr-1" />
												<span className="hidden sm:inline">Zen</span>
											</TabsTrigger>
										</TabsList>

										<Suspense
											fallback={
												<div className="space-y-4">
													<Skeleton className="h-64 w-full" />
													<Skeleton className="h-40 w-full" />
												</div>
											}
										>
											<TabsContent value="dice">
												<DiceGame
													onPlaceBet={handlePlaceBet}
													isPlaying={placeBetMutation.isPending || isAutoBetting}
													currentBalance={parseFloat(currentWallet?.available_balance || '0')}
													lastOutcome={lastSession?.outcome}
													lastWon={lastSession?.status === 2}
													winAmount={parseFloat(lastSession?.win_amount || '0')}
												/>
											</TabsContent>

											<TabsContent value="slots">
												<SlotsGame
													onPlaceBet={handlePlaceBet}
													isPlaying={placeBetMutation.isPending || isAutoBetting}
													currentBalance={parseFloat(currentWallet?.available_balance || '0')}
													lastOutcome={lastSession?.outcome}
													lastWon={lastSession?.status === 2}
												/>
											</TabsContent>

											<TabsContent value="balloon">
												<BalloonGame
													onPlaceBet={handlePlaceBet}
													isPlaying={placeBetMutation.isPending || isAutoBetting}
													currentBalance={parseFloat(currentWallet?.available_balance || '0')}
													lastOutcome={lastSession?.outcome}
													lastWon={lastSession?.status === 2}
												/>
											</TabsContent>

											<TabsContent value="plinko">
												<PlinkoGame
													onPlaceBet={handlePlaceBet}
													isPlaying={placeBetMutation.isPending || isAutoBetting}
													currentBalance={parseFloat(currentWallet?.available_balance || '0')}
													lastOutcome={lastSession?.outcome}
													lastWon={lastSession?.status === 2}
												/>
											</TabsContent>

											<TabsContent value="roulette">
												<RouletteGame
													onPlaceBet={handlePlaceBet}
													isPlaying={placeBetMutation.isPending || isAutoBetting}
													currentBalance={parseFloat(currentWallet?.available_balance || '0')}
													lastOutcome={lastSession?.outcome}
													lastWon={lastSession?.status === 2}
												/>
											</TabsContent>

											<TabsContent value="auto">
												<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
													<DiceGame
														onPlaceBet={handlePlaceBet}
														isPlaying={placeBetMutation.isPending || isAutoBetting}
														currentBalance={parseFloat(currentWallet?.available_balance || '0')}
														lastOutcome={lastSession?.outcome}
														lastWon={lastSession?.status === 2}
														winAmount={parseFloat(lastSession?.win_amount || '0')}
													/>
													<AutoBet
														onStart={handleStartAutoBet}
														onStop={handleStopAutoBet}
														isRunning={isAutoBetting}
														currentBalance={parseFloat(currentWallet?.available_balance || '0')}
														currentBetCount={autoBetCount}
														totalBets={autoBetConfig?.numberOfBets || 0}
													/>
												</div>
											</TabsContent>

											<TabsContent value="stats">
												<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
													<GameStats
														sessions={gameSessions}
														currency={selectedCurrency}
													/>
													<TransactionHistory
														transactions={transactions}
														currency={selectedCurrency}
													/>
												</div>
											</TabsContent>

											<TabsContent value="history">
												<GameHistory
													sessions={gameSessions}
													onVerify={handleVerifySession}
												/>
											</TabsContent>

											<TabsContent value="verify">
												<FairnessVerification
													sessionId={selectedSessionId || undefined}
													serverSeed={verificationData?.serverSeed.seed_value}
													clientSeed={verificationData?.session.client_seed}
													nonce={verificationData?.session.nonce}
													expectedOutcome={verificationData?.session.outcome || undefined}
												/>
											</TabsContent>

											<TabsContent value="leaderboard">
												<Leaderboard />
											</TabsContent>
											<TabsContent value="zen">
												<div className="text-center">
													<h2 className="text-2xl font-bold">Zen Mode</h2>
													<p className="text-muted-foreground">A clean and simple theme for a focused gaming experience.</p>
												</div>
											</TabsContent>
										</Suspense>
									</Tabs>
								</div>

								<div className="lg:sticky lg:top-6 space-y-6">
									<RecentResults results={gameSessions.map(s => ({ won: s.status === 2, multiplier: parseFloat(s.win_amount || '0') / parseFloat(s.bet_amount || '1') }))} />
									<PlayerStats sessions={gameSessions} currency={selectedCurrency} />
									<LiveActivityFeed sessions={gameSessions} currency={selectedCurrency} />
								</div>
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>

				<ResponsibleGamingModal
					isOpen={rgModalOpen}
					onClose={() => setRgModalOpen(false)}
					kycLevel={currentUser?.kyc_level}
					currency={selectedCurrency}
				/>

				<ArcadePassModal
					isOpen={arcadePassModalOpen}
					onClose={() => setArcadePassModalOpen(false)}
				/>

				<WelcomeOfferModal
					isOpen={welcomeModalOpen}
					onClose={() => setWelcomeModalOpen(false)}
				/>

				<DepositDialog
					open={depositDialogOpen}
					onOpenChange={setDepositDialogOpen}
					currency={selectedCurrency}
					onDeposit={handleDeposit}
					isDepositing={depositMutation.isPending}
				/>

				<KycVerificationDialog
					open={kycDialogOpen}
					onOpenChange={setKycDialogOpen}
					level={currentUser?.kyc_level || 0}
					onUpgradeLevel={async () => {
						// TODO: Implement KYC level upgrade
					}}
				/>

				<OnboardingTutorial />
				<SettingsPortal kycLevel={currentUser?.kyc_level} isBanned={currentUser?.is_banned} currency={selectedCurrency} />
			</div>
		</div>
	);
}

export default App;
