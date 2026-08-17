import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { preferencesStore } from '@/features/preferences';
import { GeneralSection } from './GeneralSection';

describe('GeneralSection', () => {
  beforeEach(() => {
    localStorage.clear();
    preferencesStore.reload();
  });

  test('shows the appearance controls', () => {
    render(<GeneralSection />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Accent color')).toBeInTheDocument();
  });

  test('says the choice is local, since nothing syncs it', () => {
    render(<GeneralSection />);
    expect(screen.getAllByText('Saved on this device').length).toBeGreaterThan(0);
  });

  test('saves the theme when it changes', async () => {
    const user = userEvent.setup();
    render(<GeneralSection />);

    await user.click(screen.getByText('Dark'));
    await user.click(screen.getByText('Light'));

    expect(preferencesStore.get().appearance.theme).toBe('light');
  });

  test('no longer offers workspace fields, which had no backend', () => {
    render(<GeneralSection />);
    expect(screen.queryByText('Workspace name')).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace URL')).not.toBeInTheDocument();
  });

  test('no longer offers notification toggles, which had no backend', () => {
    render(<GeneralSection />);
    expect(screen.queryByText('Desktop notifications')).not.toBeInTheDocument();
    expect(screen.queryByText('Email digest')).not.toBeInTheDocument();
  });
});
