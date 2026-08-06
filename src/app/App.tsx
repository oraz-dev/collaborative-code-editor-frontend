import { AppRouter } from './providers/router';
import { QueryProvider } from './providers/QueryProvider/QueryProvider';
import { SessionProvider } from './providers/SessionProvider/SessionProvider';
import { PreferencesProvider } from './providers/PreferencesProvider/PreferencesProvider';
import { OfflineBanner } from '@/widgets/OfflineBanner/OfflineBanner';
import { ToastProvider } from '@/shared/ui/Toast/ToastProvider';

const App = () => {
  return (
    <QueryProvider>
      <PreferencesProvider>
        <SessionProvider>
          <ToastProvider>
            <div className="app">
              <OfflineBanner />
              <AppRouter />
            </div>
          </ToastProvider>
        </SessionProvider>
      </PreferencesProvider>
    </QueryProvider>
  );
};

export default App;
