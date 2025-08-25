import React, { useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { format } from 'date-fns';
import {
  Main,
  Status,
  Typography,
  Button,
  SingleSelect,
  SingleSelectOption,
  Loader,
} from '@strapi/design-system';
import { UID } from '@strapi/strapi';
import { StrapiTable } from '../components/StrapiTable';
import { ColumnSorter } from '../components/ColumnSorter';

const HomePage = () => {
  const { get } = useFetchClient();

  const [dropDownData, setDropDownData] = useState<
    Array<{ label: string; value: UID.ContentType }>
  >([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [sortedColumns, setSortedColumns] = useState<string[]>([]);
  const [tableData, setTableData] = useState<Array<Record<string, string>>>([]);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuccessMessage, setIsSuccessMessage] = useState(false);
  const [fileName, setFileName] = useState('');

  const [loading, setLoading] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const { data } = await get('/csv-exporter/dropdownvalues');
        setDropDownData(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching dropdown value:', error);
        setIsLoading(false);
      }
    };

    fetchDropdownData();
  }, []);

  const handleComboboxChange = async (value: string | null) => {
    setSelectedValue(value);
    setCurrentPage(1);
    if (value) {
      fetchData(value, 1, perPage);
    } else {
      setColumns([]);
      setSortedColumns([]);
      setTableData([]);
    }
  };

  const handleColumnsReorder = (newOrder: string[]) => {
    setSortedColumns(newOrder);
  };

  const handleColumnDelete = (columnToDelete: string) => {
    const updatedColumns = sortedColumns.filter((column) => column !== columnToDelete);
    setSortedColumns(updatedColumns);
  };

  const handleResetColumns = () => {
    setSortedColumns([...columns]);
  };

  const handleDownloadCSV = async () => {
    try {
      const response = await get('/csv-exporter/download', {
        params: {
          uid: selectedValue,
          sortOrder: sortedColumns,
        },
      });

      if (response.data) {
        const formattedDate = format(new Date(), 'dd_MM_yyyy_HH_mm');
        const downloadFileName = `${selectedValue?.split('.')[1]}-export-${formattedDate}.csv`;
        setFileName(downloadFileName);

        const blob = new Blob([response.data], {
          type: 'text/csv',
        });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = downloadFileName;
        link.click();

        setIsSuccessMessage(true);
        setTimeout(() => {
          setIsSuccessMessage(false);
        }, 8000);
      }
    } catch (error) {
      console.error('Error downloading csv file:', error);
    }
  };

  const fetchData = async (value: string, page: number, newPerPage: number) => {
    setLoading(true);
    const currentSelectedValue = value;

    if (currentSelectedValue) {
      try {
        const offset = (page - 1) * newPerPage;
        const limit = newPerPage;

        const { data: table } = await get(
          `/csv-exporter/tabledata?uid=${value}&limit=${limit}&offset=${offset}`
        );

        if (table.columns) {
          setColumns(table.columns);
          // Initialize sorted columns if not already set or if columns changed
          if (sortedColumns.length === 0 || sortedColumns.length !== table.columns.length) {
            setSortedColumns(table.columns);
          }
        }

        if (table.data) {
          setTableData(table.data);
          setTotalRows(table.count);
        }
      } catch (error) {
        console.error('Error fetching table data:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePageChange = (page: number) => {
    if (!selectedValue) return;
    setCurrentPage(page);
    fetchData(selectedValue, page, perPage);
  };

  const handlePerRowsChange = async (newPerPage: number, currentPage: number) => {
    setLoading(true);
    setPerPage(newPerPage);
    setCurrentPage(1);

    try {
      const offset = 0;
      const limit = newPerPage;

      const { data: table } = await get(
        `/csv-exporter/tabledata?uid=${selectedValue}&limit=${limit}&offset=${offset}`
      );

      if (table.data) {
        setTableData(table.data);
        setTotalRows(table.count);
      }
    } catch (error) {
      console.error('Error fetching table data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '32px', gap: '24px' }}>
      <Typography variant="alpha">CSV Export</Typography>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginTop: '8px',
        }}
      >
        <label htmlFor="collectionType">
          <Typography variant="omega" fontWeight="bold">
            Collection Type
          </Typography>
        </label>
        <div style={{ maxWidth: '324px', display: 'flex', alignItems: 'center' }}>
          <SingleSelect
            id="collectionType"
            value={selectedValue || ''}
            onChange={(value) => handleComboboxChange(value.toString())}
            size="M"
            placeholder="Select Collection Type"
          >
            {dropDownData.map((item) => (
              <SingleSelectOption key={item.value} value={item.value}>
                {item.label}
              </SingleSelectOption>
            ))}
          </SingleSelect>
          {isLoading && <Loader small />}
        </div>
      </div>

      {selectedValue && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Button
            onClick={handleDownloadCSV}
            size="L"
            style={{
              width: '300px',
            }}
          >
            Download
          </Button>

          {isSuccessMessage && (
            <Status variant="success">
              <Typography>Download completed: {fileName} successfully downloaded!</Typography>
            </Status>
          )}

          <ColumnSorter
            columns={sortedColumns}
            onColumnsReorder={handleColumnsReorder}
            onColumnDelete={handleColumnDelete}
            onResetColumns={handleResetColumns}
            originalColumnsCount={columns.length}
          />

          <StrapiTable
            columns={sortedColumns}
            data={tableData}
            totalRows={totalRows}
            currentPage={currentPage}
            perPage={perPage}
            loading={loading}
            onPageChange={handlePageChange}
            onPerPageChange={handlePerRowsChange}
          />
        </div>
      )}
    </div>
  );
};

export { HomePage };
