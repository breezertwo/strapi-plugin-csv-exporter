import {
  Table,
  Thead,
  Tbody,
  Tr,
  Td,
  Th,
  Typography,
  Box,
  Flex,
  SingleSelect,
  SingleSelectOption,
  Pagination,
  PageLink,
  NextLink,
  PreviousLink,
} from '@strapi/design-system';
import { Layouts } from '@strapi/strapi/admin';
import { useEffect, useRef, useState } from 'react';

interface StrapiTableProps {
  columns: string[]; // Columns in the desired display order
  data: Array<Record<string, string>>;
  totalRows: number;
  currentPage: number;
  perPage: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number, currentPage: number) => void;
}

const StrapiTable: React.FC<StrapiTableProps> = ({
  columns,
  data,
  totalRows,
  currentPage,
  perPage,
  loading = false,
  onPageChange,
  onPerPageChange,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(window.innerWidth - 124);
  const totalPages = Math.ceil(totalRows / perPage);
  const perPageOptions = [1, 10, 20, 50, 100, 250];

  const handlePerPageChange = (value: string) => {
    const newPerPage = parseInt(value, 10);
    onPerPageChange(newPerPage, currentPage);
  };

  useEffect(() => {
    const handleResize = () => {
      setWidth(window.innerWidth - 124);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (loading) {
    return (
      <Box padding={8}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ width: `${width}px` }}>
        <Table colCount={columns.length} rowCount={data.length}>
          <Thead>
            <Tr>
              {/* Render headers in the order specified by columns prop */}
              {columns.map((column) => (
                <Th key={column}>
                  <Typography variant="sigma">
                    {column.charAt(0).toUpperCase() + column.slice(1).replace(/_/g, ' ')}
                  </Typography>
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {data.map((row, rowIndex) => (
              <Tr key={rowIndex}>
                {/* Render data cells in the same order as headers */}
                {columns.map((column) => (
                  <Td key={column}>
                    <Typography textColor="neutral800">{row[column] || '-'}</Typography>
                  </Td>
                ))}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>

      <Flex ref={ref} justifyContent="space-between" alignItems="center">
        <Flex gap={2} alignItems="center">
          <Typography variant="omega">Items per page:</Typography>
          <SingleSelect
            size="S"
            value={perPage.toString()}
            onChange={(value) => handlePerPageChange(value.toString())}
          >
            {perPageOptions.map((option) => (
              <SingleSelectOption key={option} value={option}>
                {option}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Flex>
        <Pagination activePage={currentPage} pageCount={totalPages}>
          <PreviousLink
            disabled={currentPage === 1}
            onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
          >
            Previous
          </PreviousLink>

          {(() => {
            const pages = [];
            const showEllipsisThreshold = 7;

            if (totalPages <= showEllipsisThreshold) {
              // Show all pages if total is small
              for (let i = 1; i <= totalPages; i++) {
                pages.push(
                  <PageLink key={i} number={i} onClick={() => onPageChange(i)}>
                    {i}
                  </PageLink>
                );
              }
            } else {
              // Always show first page
              pages.push(
                <PageLink key={1} number={1} onClick={() => onPageChange(1)}>
                  1
                </PageLink>
              );

              // Show ellipsis if current page is far from start
              if (currentPage > 3) {
                pages.push(<Typography variant="pi">...</Typography>);
              }

              // Show pages around current page
              const start = Math.max(2, currentPage - 1);
              const end = Math.min(totalPages - 1, currentPage + 1);

              for (let i = start; i <= end; i++) {
                pages.push(
                  <PageLink key={i} number={i} onClick={() => onPageChange(i)}>
                    {i}
                  </PageLink>
                );
              }

              // Show ellipsis if current page is far from end
              if (currentPage < totalPages - 2) {
                pages.push(<Typography variant="pi">...</Typography>);
              }

              // Always show last page
              pages.push(
                <PageLink
                  key={totalPages}
                  number={totalPages}
                  onClick={() => onPageChange(totalPages)}
                >
                  {totalPages}
                </PageLink>
              );
            }

            return pages;
          })()}

          <NextLink
            disabled={currentPage === totalPages}
            onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
          >
            Next
          </NextLink>
        </Pagination>
      </Flex>
    </div>
  );
};

export { StrapiTable };
