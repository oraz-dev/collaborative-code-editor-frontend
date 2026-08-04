import { useState, useCallback, memo, type FormEvent } from 'react';
import cls from './AuthPage.module.scss';
import { Logo } from '@/shared/ui/Logo/Logo';
import { PresenceCursor } from '@/shared/ui/PresenceCursor/PresenceCursor';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';
import { isApiError } from '@/shared/api';
import { useLogin, useRegister } from '@/features/auth';

type AuthMode = 'signin' | 'signup';

/** Turns a transport failure into something worth reading. */
function describeError(error: unknown, mode: AuthMode): string {
  if (!isApiError(error)) {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }
  if (error.kind === 'network') return 'Cannot reach the server. Check your connection and try again.';
  if (error.kind === 'timeout') return 'The server took too long to respond. Please try again.';
  if (error.status === 401) return 'That email and password do not match.';
  if (error.status === 409) return 'An account with that email or username already exists.';

  // The server rejects unrecognised origins with a bodyless 403, which happens
  // when the dev server is on a port the backend does not allowlist.
  if (error.status === 403) {
    return 'The server refused the request from this address. If you are running locally, try port 3000.';
  }

  // Field-level validation, e.g. { Email: "email" } or { Password: "min" }.
  if (error.fieldErrors) return error.message;

  if (error.status === 400) {
    return mode === 'signup'
      ? 'Please check your details — all fields are required.'
      : 'Please enter a valid email and password.';
  }
  return error.message;
}

export const AuthPage = memo(() => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const isSignup = mode === 'signup';
  const activeMutation = isSignup ? registerMutation : loginMutation;
  const isPending = activeMutation.isPending;
  const error = activeMutation.error;

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  }, []);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  }, []);

  const handleUsernameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
  }, []);

  const handleDisplayNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(e.target.value);
  }, []);

  const onToggleMode = useCallback(() => {
    setMode((current) => (current === 'signin' ? 'signup' : 'signin'));
    loginMutation.reset();
    registerMutation.reset();
  }, [loginMutation, registerMutation]);

  const onSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    // On success the session cache updates and RequireGuest redirects on its
    // own, so there is no navigation to perform here.
    if (isSignup) {
      registerMutation.mutate({
        email: email.trim(),
        password,
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
      });
      return;
    }

    loginMutation.mutate({ email: email.trim(), password });
  }, [displayName, email, isPending, isSignup, loginMutation, password, registerMutation, username]);

  const canSubmit = email.trim().length > 0
    && password.length > 0
    && (!isSignup || username.trim().length > 0);

  return (
    <div className={cls.root}>
      <div className={cls.brand}>
        <div className={cls.top}>
          <Logo size={64} className={cls.logo} />
          <span className={cls.word}>Space</span>
        </div>
        <div className={cls.pitch}>
          <h1>A calm place to build, <em>together.</em></h1>
          <p>Everyone on the same line — live cursors, no save button, no merge conflicts to untangle.</p>
          <div className={cls.vignette}>
            <div className={cls.vigBar}>
              <div className={cls.vigDots}>
                <span className={cls.vigDotCoral} />
                <span className={cls.vigDotAmber} />
                <span className={cls.vigDotMint} />
              </div>
              <span className={cls.vigName}>editor.tsx</span>
              <span className={cls.vigLive}><span className={cls.vigLiveDot} /> 3 editing</span>
            </div>
            <div className={cls.vigCode}>
              <div className={cls.vln}><span className={cls.vlnG}>1</span><span className={cls.vlnS}><span className="k">export function</span> <span className="f">Editor</span>() {'{'}</span></div>
              <div className={cls.vln}><span className={cls.vlnG}>2</span><span className={cls.vlnS}>  <span className="k">const</span> <span className="v">peers</span> = <span className="f">usePresence</span>()</span></div>
              <div className={cls.vln}><span className={cls.vlnG}>3</span><span className={cls.vlnS}>  <span className="k">return</span> &lt;<span className="t">Surface</span> <span className="v">live</span> /&gt;</span></div>
              <div className={cls.vln}><span className={cls.vlnG}>4</span><span className={cls.vlnS}>{'}'}</span></div>
            </div>
            <div className={cls.cursorAda}><PresenceCursor name="Ada" color="var(--presence-2)" x={0} y={0} variant="caret" /></div>
            <div className={cls.cursorMira}><PresenceCursor name="Mira" color="var(--presence-4)" x={0} y={0} /></div>
          </div>
        </div>
        <div className={cls.foot}>
          <span>&copy; 2026 Space</span><a href="#">Privacy</a><a href="#">Terms</a>
        </div>
      </div>
      <div className={cls.form}>
        <form className={cls.card} onSubmit={onSubmit} noValidate>
          <div className={cls.eyebrow}>{isSignup ? 'Get started' : 'Welcome back'}</div>
          <h2 className={cls.h2}>{isSignup ? 'Create your workspace' : 'Sign in to Space'}</h2>
          <p className={cls.sub}>
            {isSignup ? 'A shared place for you and your team.' : 'Continue to your shared workspace.'}
          </p>

          <div className={cls.field}>
            <div className={cls.fieldLabel}>Work email</div>
            <div className={cls.fieldInput}>
              <Icons.Mail size={16} />
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@studio.com"
                value={email}
                onChange={handleEmailChange}
                aria-label="Work email"
                required
              />
            </div>
          </div>

          {isSignup && (
            <>
              <div className={cls.field}>
                <div className={cls.fieldLabel}>Username</div>
                <div className={cls.fieldInput}>
                  <Icons.User size={16} />
                  <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    placeholder="ada"
                    value={username}
                    onChange={handleUsernameChange}
                    aria-label="Username"
                    required
                  />
                </div>
              </div>
              <div className={cls.field}>
                <div className={cls.fieldLabel}>Display name</div>
                <div className={cls.fieldInput}>
                  <Icons.User size={16} />
                  <input
                    type="text"
                    name="displayName"
                    autoComplete="name"
                    placeholder="Ada Lovelace"
                    value={displayName}
                    onChange={handleDisplayNameChange}
                    aria-label="Display name"
                  />
                </div>
              </div>
            </>
          )}

          <div className={cls.field}>
            <div className={cls.fieldLabel}>Password</div>
            <div className={cls.fieldInput}>
              <Icons.Lock size={16} />
              <input
                type="password"
                name="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={password}
                onChange={handlePasswordChange}
                aria-label="Password"
                required
              />
            </div>
          </div>

          {Boolean(error) && (
            <div className={cls.error} role="alert" data-testid="auth-error">
              {describeError(error, mode)}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit || isPending}
            isLoading={isPending}
            aria-label={isSignup ? 'Create account' : 'Sign in'}
          >
            {isSignup ? 'Create account' : 'Continue with email'}
          </Button>

          <p className={cls.legal}>
            By continuing you agree to Space&apos;s <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
          </p>
          <div className={cls.switch}>
            {isSignup ? 'Already have an account? ' : 'New to Space? '}
            <a onClick={onToggleMode} role="button" tabIndex={0} data-testid="auth-toggle">
              {isSignup ? 'Sign in' : 'Create a workspace'}
            </a>
          </div>
        </form>
      </div>
    </div>
  );
});
