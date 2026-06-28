import { useState, useCallback, memo } from 'react';
import cls from './AuthPage.module.scss';
import { useNavigate } from 'react-router';
import { Logo } from '@/shared/ui/Logo/Logo';
import { PresenceCursor } from '@/shared/ui/PresenceCursor/PresenceCursor';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';

export const AuthPage = memo(() => {
  const [email, setEmail] = useState('');
  const router = useNavigate()

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  }, []);

  const onSignIn = useCallback(() => {
    router('/dashboard');
  }, [router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  onSignIn();
  }, [onSignIn]);

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
        <div className={cls.card}>
          <div className={cls.eyebrow}>Welcome back</div>
          <h2 className={cls.h2}>Sign in to Space</h2>
          <p className={cls.sub}>Continue to your shared workspace.</p>
          <div className={cls.field}>
            <div className={cls.fieldLabel}>Work email</div>
            <div className={cls.fieldInput}>
              <Icons.Mail size={16} />
              <input type="email" placeholder="you@studio.com" value={email} onChange={handleEmailChange} onKeyDown={handleKeyDown} aria-label="Work email" />
            </div>
          </div>
          <Button variant="primary" onClick={onSignIn}>Continue with email</Button>
          <div className={cls.divider}>or</div>
          <div className={cls.sso}>
            <Button variant="secondary" onClick={onSignIn}><Icons.GitHub size={17} /> Continue with GitHub</Button>
            <Button variant="secondary" onClick={onSignIn}><Icons.Google size={16} /> Continue with Google</Button>
          </div>
          <p className={cls.legal}>By continuing you agree to Space&apos;s <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.</p>
          <div className={cls.switch}>New to Space? <a onClick={onSignIn}>Create a workspace</a></div>
        </div>
      </div>
    </div>
  );
});
