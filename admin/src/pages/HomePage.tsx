import React, { useEffect, useState } from 'react';
import { useAuth, useFetchClient } from '@strapi/strapi/admin';
import { format } from 'date-fns';
import {
  Status,
  Typography,
  Button,
  SingleSelect,
  SingleSelectOption,
  Loader,
  Flex,
} from '@strapi/design-system';
import { StrapiTable } from '../components/StrapiTable';
import { ColumnSorter } from '../components/ColumnSorter';

type DropDownValue = {
  label: string;
  value: string;
};

interface DropDownValues {
  locales: DropDownValue[];
  contentTypes: DropDownValue[];
}

const HomePage = () => {
  const { get } = useFetchClient();
  const token = useAuth('CSVExporterHomePage', (state) => state.token);

  const [dropDownData, setDropDownData] = useState<DropDownValues>({
    locales: [],
    contentTypes: [],
  });
  const [columns, setColumns] = useState<string[]>([]);
  const [sortedColumns, setSortedColumns] = useState<string[]>([]);
  const [tableData, setTableData] = useState<Array<Record<string, string>>>([]);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<string>('de');
  const [isLoading, setIsLoading] = useState(true);
  const [isSuccessMessage, setIsSuccessMessage] = useState(false);
  const [isError, setIsError] = useState(false);
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

  const handleCollectionTypeChange = async (value: string | null) => {
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

  const handleLocaleChange = async (locale: string) => {
    if (isLoading) return;
    setSelectedLocale(locale);

    if (!selectedValue) return;
    fetchData(selectedValue, 1, perPage, locale);
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
    if (!selectedValue) return;

    try {
      // Build custom fetch request as strapi get always processes with json and arraybuffer is needed here
      const url = new URL('/csv-exporter/download', window.location.origin);
      url.searchParams.append('uid', selectedValue);
      url.searchParams.append('locale', selectedLocale);
      sortedColumns.forEach((column, index) => {
        url.searchParams.append(`sortOrder[${index + 1}]`, column);
      });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          //Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Fetch request failed with status code ' + response.status);
      }

      const formattedDate = format(new Date(), 'dd_MM_yyyy_HH_mm');
      const downloadFileName = `${selectedValue?.split('.')[1]}-export-${formattedDate}.csv`;
      setFileName(downloadFileName);

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], {
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
    } catch (error) {
      setIsError(true);
      setTimeout(() => {
        setIsError(false);
      }, 8000);

      console.error('Error downloading csv file:', error);
      return;
    }
  };

  const fetchData = async (value: string, page: number, newPerPage: number, locale?: string) => {
    setLoading(true);
    if (value) {
      try {
        const offset = (page - 1) * newPerPage;
        const limit = newPerPage;

        const { data: table } = await get(
          `/csv-exporter/tabledata?uid=${value}&limit=${limit}&offset=${offset}&locale=${locale || selectedLocale}`
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
        `/csv-exporter/tabledata?uid=${selectedValue}&limit=${limit}&offset=${offset}&locale=${selectedLocale}`
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
    <Flex
      paddingTop={8}
      paddingBottom={8}
      paddingLeft={10}
      paddingRight={10}
      gap={6}
      direction="column"
      alignItems="flex-start"
    >
      <Typography variant="alpha">CSV Export</Typography>
      <Flex gap={4} direction="row" justifyContent="space-between" alignItems="flex-end">
        <Flex gap={2} direction="column" marginTop={2} alignItems="flex-start" grow={1}>
          <label htmlFor="collectionType">
            <Typography variant="omega" fontWeight="bold">
              Collection Type
            </Typography>
          </label>
          <div style={{ maxWidth: '324px', display: 'flex', alignItems: 'center' }}>
            <SingleSelect
              id="collectionType"
              value={selectedValue || ''}
              onChange={(value) => handleCollectionTypeChange(value.toString())}
              size="M"
              placeholder="Select Collection Type"
            >
              {dropDownData.contentTypes.map((item) => (
                <SingleSelectOption key={item.value} value={item.value}>
                  {item.label}
                </SingleSelectOption>
              ))}
            </SingleSelect>
            {isLoading && <Loader small />}
          </div>
        </Flex>
        <Flex gap={2} direction="column" marginTop={2} alignItems="flex-start">
          <div style={{ maxWidth: '324px', display: 'flex', alignItems: 'center' }}>
            <SingleSelect
              id="locales"
              value={selectedLocale || ''}
              onChange={(value) => {
                handleLocaleChange(value.toString());
              }}
              size="M"
              placeholder="Select locale"
            >
              {dropDownData.locales.map((item) => (
                <SingleSelectOption key={item.value} value={item.value}>
                  {item.label}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </div>
        </Flex>
      </Flex>
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

          {isError && (
            <Status variant="danger">
              <Typography>Error occurred while downloading the CSV file.</Typography>
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
    </Flex>
  );
};

export { HomePage };
