import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { WalletConnect } from '@/components/WalletConnect';
import { runtimeConfig } from '@/config/runtime';
import { useWallet } from '@/hooks/useWallet';

export const Route = createFileRoute('/')({
  component: App,
});

const DemoCasinoApp = lazy(() => import('@/demo/DemoCasinoApp'));

function ProductionAuthGate() {
  const {
    connectedAddress,
    productionSession,
    isConnected,
    isConnecting,
    connectionError,
    connectWallet,
    disconnectWallet,
  } = useWallet();

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-6">
        <div className="w-full space-y-6">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Casino-Wellz secure access</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Production access uses a one-time server challenge and an HttpOnly authenticated session.
              Signing the login message does not authorize a transaction or transfer funds.
            </p>
          </div>

          <WalletConnect
            isConnected={isConnected}
            connectedAddress={connectedAddress}
            onConnect={connectWallet}
            onDisconnect={() => {
              void disconnectWallet();
            }}
            isConnecting={isConnecting}
            error={connectionError}
          />

          {isConnected && productionSession ? (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-2">
                  <h2 className="font-semibold">Identity verified</h2>
                  <p className="text-sm text-muted-foreground">
                    Your wallet session is authenticated by the server. Real-money balances, deposits,
                    withdrawals, and wagering remain disabled until the authoritative ledger, game engine,
                    payments, and compliance phases are completed and independently validated.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Session expires {new Date(productionSession.expiresAt).toLocaleString()}.
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function App() {
  if (runtimeConfig.mode === 'production') {
    return <ProductionAuthGate />;
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          Loading demo…
        </div>
      }
    >
      <DemoCasinoApp />
    </Suspense>
  );
}

export default App;
