import { render } from '@testing-library/react';
import { Table } from './Table';

describe('Table', () => {
  test('renders without crashing', () => {
    const { container } = render(
      <Table>
        <tbody>
          <tr><td>Cell</td></tr>
        </tbody>
      </Table>
    );
    expect(container.querySelector('table')).toBeInTheDocument();
  });
});
