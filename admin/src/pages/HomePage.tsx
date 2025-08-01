import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DataTable, { TableColumn } from 'react-data-table-component';
import { useFetchClient } from '@strapi/strapi/admin';
import { format } from 'date-fns';
import {
  Main,
  Status,
  Typography,
  Button,
  SingleSelect,
  SingleSelectOption,
} from '@strapi/design-system';
import { UID } from '@strapi/strapi';
import { Table, Thead, Tbody, Tr, Td, Th } from '@strapi/design-system';

const HomePage = () => {
  const { get } = useFetchClient();

  const [dropDownData, setDropDownData] = useState<
    Array<{ label: string; value: UID.ContentType }>
  >([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [tableData, setTableData] = useState<Array<Record<string, string>>>([]);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuccessMessage, setIsSuccessMessage] = useState(false);
  const [fileName, setFileName] = useState('');

  const [loading, setLoading] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [perPage, setPerPage] = useState(10);

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
    if (value) {
      fetchData(value, 1, 10);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      const response = await axios.get('/csv-exporter/download/csv', {
        responseType: 'arraybuffer',
        params: {
          uid: selectedValue,
        },
      });

      if (response.data) {
        const currentDate = new Date();
        const formattedDate = format(currentDate, 'dd_MM_yyyy_HH_mm');
        const downloadFileName = `${selectedValue?.split('.')[1]}-export-${formattedDate}.csv`;
        setFileName(downloadFileName);

        const blob = new Blob([response.data], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

  const columnRestructure: TableColumn<Record<string, string>>[] = columns.map((property) => ({
    name: (
      <Th>
        <Typography variant="sigma">
          {property.charAt(0).toUpperCase() + property.slice(1).replace(/_/g, ' ')}
        </Typography>
      </Th>
    ),
    selector: (row) => row[property],
    cell: (row) => (
      <Td>
        <Typography variant="omega" textColor="red">
          {row[property]}
        </Typography>
      </Td>
    ),
  }));

  const fetchData = async (value: string, page: number, newPerPage: number) => {
    setLoading(true);
    const currentSelectedValue = value;

    if (currentSelectedValue) {
      try {
        const offset = (page - 1) * newPerPage;
        const limit = newPerPage;

        const { data: table } = await get(
          `/csv-exporter/get/table/data?uid=${value}&limit=${limit}&offset=${offset}`
        );

        if (table.columns) {
          setColumns(table.columns);
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
    fetchData(selectedValue, page, perPage);
  };

  const handlePerRowsChange = async (newPerPage: number, currentPage: number) => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * newPerPage;
      const limit = newPerPage;

      const response = await axios.get(
        `/csv-exporter/get/table/data?uid=${selectedValue}&limit=${limit}&offset=${offset}`
      );

      if (response?.data?.data) {
        setTableData(response.data.data);
        setPerPage(newPerPage);
      }
    } catch (error) {
      console.error('Error fetching table data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px' }}>
          <Typography variant="alpha">CSV Export</Typography>
        </div>

        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="collectionType">
                <Typography variant="omega" fontWeight="bold">
                  Collection Type
                </Typography>
              </label>
              <div style={{ maxWidth: '300px', marginTop: '8px' }}>
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
              </div>
            </div>

            {selectedValue && (
              <>
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

                <DataTable
                  pagination
                  columns={columnRestructure}
                  data={tableData}
                  progressPending={loading}
                  paginationServer
                  paginationTotalRows={totalRows}
                  onChangeRowsPerPage={handlePerRowsChange}
                  onChangePage={handlePageChange}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { HomePage };
