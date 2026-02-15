/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './table';

describe('Table', () => {
  it('renders', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(document.querySelector('[data-slot="table"]')).toBeInTheDocument();
  });

  it('wraps table in container', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-container"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Table className="custom-table">
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('table')).toHaveClass('custom-table');
  });
});

describe('TableHeader', () => {
  it('renders', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );

    expect(screen.getByRole('rowgroup')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-header"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Table>
        <TableHeader className="custom-header">
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-header"]')).toHaveClass('custom-header');
  });
});

describe('TableBody', () => {
  it('renders', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('rowgroup')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-body"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Table>
        <TableBody className="custom-body">
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-body"]')).toHaveClass('custom-body');
  });
});

describe('TableFooter', () => {
  it('renders', () => {
    render(
      <Table>
        <TableFooter>
          <TableRow>
            <TableCell>Footer</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-footer"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Table>
        <TableFooter className="custom-footer">
          <TableRow>
            <TableCell>Footer</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-footer"]')).toHaveClass('custom-footer');
  });
});

describe('TableRow', () => {
  it('renders', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-row"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Table>
        <TableBody>
          <TableRow className="custom-row">
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('row')).toHaveClass('custom-row');
  });
});

describe('TableHead', () => {
  it('renders', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );

    expect(screen.getByRole('columnheader')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-head"]')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Column Title</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );

    expect(screen.getByText('Column Title')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="custom-head">Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );

    expect(screen.getByRole('columnheader')).toHaveClass('custom-head');
  });
});

describe('TableCell', () => {
  it('renders', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell content</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('cell')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-cell"]')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell data</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByText('Cell data')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="custom-cell">Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('cell')).toHaveClass('custom-cell');
  });
});

describe('TableCaption', () => {
  it('renders', () => {
    render(
      <Table>
        <TableCaption>Table caption</TableCaption>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByText('Table caption')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Table>
        <TableCaption>Caption</TableCaption>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-caption"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Table>
        <TableCaption className="custom-caption">Caption</TableCaption>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(document.querySelector('[data-slot="table-caption"]')).toHaveClass('custom-caption');
  });
});

describe('Full Table Integration', () => {
  it('renders a complete table', () => {
    render(
      <Table>
        <TableCaption>User data</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>John</TableCell>
            <TableCell>john@example.com</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Jane</TableCell>
            <TableCell>jane@example.com</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Total: 2 users</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('User data')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Total: 2 users')).toBeInTheDocument();
  });
});
