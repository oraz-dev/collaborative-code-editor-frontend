import { AppRouter } from './providers/router';
import { QueryProvider } from './providers/QueryProvider/QueryProvider';
import { SessionProvider } from './providers/SessionProvider/SessionProvider';
import { OfflineBanner } from '@/widgets/OfflineBanner/OfflineBanner';

const App = () => {
  return (
    <QueryProvider>
      <SessionProvider>
        <div className="app">
          <OfflineBanner />
          <AppRouter />
        </div>
      </SessionProvider>
    </QueryProvider>
  );
};

export default App;
