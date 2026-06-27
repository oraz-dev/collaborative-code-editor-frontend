import { render, screen } from '@testing-library/react';
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
    render(<ProjectCard project={project as any} />);
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });
});
