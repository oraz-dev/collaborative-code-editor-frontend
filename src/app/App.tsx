import { AppRouter } from './providers/router';
import { QueryProvider } from './providers/QueryProvider/QueryProvider';
import { SessionProvider } from './providers/SessionProvider/SessionProvider';
import { PreferencesProvider } from './providers/PreferencesProvider/PreferencesProvider';
import { OfflineBanner } from '@/widgets/OfflineBanner/OfflineBanner';

const App = () => {
  return (
    <QueryProvider>
      <PreferencesProvider>
        <SessionProvider>
          <div className="app">
            <OfflineBanner />
            <AppRouter />
          </div>
        </SessionProvider>
      </PreferencesProvider>
    </QueryProvider>
  );
};

export default App;
