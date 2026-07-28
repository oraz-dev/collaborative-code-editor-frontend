import { screen} from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { ProjectCard } from './ProjectCard';

describe('ProjectCard', () => {
  test('renders without crashing', () => {
    const project = {
      id: 'test',
      name: 'Test Project',
      desc: 'A test project',
      langs: ['tsx'],
      branch: 'main',
      updated: '2h ago',
      stars: 0,
      here: [],
    };
    renderWithProviders(<ProjectCard project={project as any} />);
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });
});
