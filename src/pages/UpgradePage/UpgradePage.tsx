import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';
import { PLANS } from '@/shared/data/demo';
import { AppBar } from '@/widgets/AppBar/AppBar';
import cls from './UpgradePage.module.scss';
import { useNavigate } from 'react-router';

// interface UpgradePageProps {
//   className?: string;
// }

export const UpgradePage = memo(() => {
  const router = useNavigate();
  return (
    <div className={cls.canvas}>
      <AppBar />
      <div className={cls.body}>
        <div className={cls.wrap}>
          <div className={cls.backWrap}>
            <div className={cls.back} onClick={() => router(-1)}><Icons.Arrow size={14} /> Back</div>
          </div>
          <div className={cls.eyebrow}>Pricing</div>
          <h1 className={cls.h1}>Choose a plan that <em>fits your team.</em></h1>
          <p className={cls.sub}>Start free, scale when you need to. All plans include live collaboration and unlimited projects.</p>
          <div className={cls.grid}>
            {PLANS.map(plan => (
              <div key={plan.name} className={classNames(cls.card, { [cls.cardPro]: !!plan.featured }, [])}>
                <div className={cls.planNameRow}>
                  <span className={cls.planName}>{plan.name}</span>
                  {plan.featured && <span className={cls.popular}><Icons.Sparkle size={11} /> Popular</span>}
                </div>
                <div className={cls.price}>
                  <span className={cls.priceAmt}>{plan.price}</span>
                  {plan.cadence && <span className={cls.pricePer}>{plan.cadence}</span>}
                </div>
                <div className={cls.planDesc}>{plan.tagline}</div>
                <div className={cls.feats}>
                  {plan.features.map(f => (
                    <div key={f} className={cls.feat}>
                      <span className={cls.featCheck}><Icons.Check size={14} /></span> {f}
                    </div>
                  ))}
                </div>
                <Button variant={plan.featured ? 'primary' : 'secondary'}>
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
          <div className={cls.faq}>
            <div className={cls.faqTitle}>Frequently asked questions</div>
            <div className={cls.faqItem}>
              <div className={cls.faqQ}>Can I switch plans later?</div>
              <div className={cls.faqA}>Yes, you can upgrade or downgrade at any time. Changes take effect at the start of your next billing cycle.</div>
            </div>
            <div className={cls.faqItem}>
              <div className={cls.faqQ}>Is there a free trial for Pro?</div>
              <div className={cls.faqA}>All paid plans include a 14-day free trial. No credit card required to start.</div>
            </div>
            <div className={cls.faqItem}>
              <div className={cls.faqQ}>What happens if I exceed usage limits?</div>
              <div className={cls.faqA}>We&apos;ll notify you before you hit the limit. You can upgrade at any point to continue without interruption.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
