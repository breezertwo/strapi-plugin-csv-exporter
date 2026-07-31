import { useEffect, useState } from "react";
import { useFetchClient } from "@strapi/strapi/admin";
import { format } from "date-fns";
import {
  Status,
  Typography,
  Button,
  SingleSelect,
  SingleSelectOption,
  Loader,
  Flex,
} from "@strapi/design-system";
import { StrapiTable } from "../components/StrapiTable";
import { ColumnSorter } from "../components/ColumnSorter";

type DropDownValue = {
  label: string;
  value: string;
};

interface DropDownValues {
  locales: DropDownValue[];
  contentTypes: DropDownValue[];
}

interface DropDownValuesResponse extends DropDownValues {
  defaultLocale?: string;
}

interface TableDataResponse {
  columns?: string[];
  data?: Array<Record<string, string>>;
  count: number;
}

const HomePage = () => {
  const { get } = useFetchClient();

  const [dropDownData, setDropDownData] = useState<DropDownValues>({
    locales: [],
    contentTypes: [],
  });
  const [columns, setColumns] = useState<string[]>([]);
  const [sortedColumns, setSortedColumns] = useState<string[]>([]);
  const [tableData, setTableData] = useState<Array<Record<string, string>>>([]);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSuccessMessage, setIsSuccessMessage] = useState(false);
  const [isError, setIsError] = useState(false);
  const [fileName, setFileName] = useState("");

  const [loading, setLoading] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const { data } = await get<DropDownValuesResponse>("/csv-exporter/dropdownvalues");
        setDropDownData(data);

        if (data.defaultLocale) {
          setSelectedLocale(data.defaultLocale);
        } else if (data.locales?.length) {
          setSelectedLocale(data.locales[0].value);
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Error fetching dropdown value:", error);
        setIsLoading(false);
      }
    };

    fetchDropdownData();
  }, []);

  const handleCollectionTypeChange = async (value: string | null) => {
    setSelectedValue(value);
    setCurrentPage(1);
    if (value) {
      fetchData(value, 1, perPage, selectedLocale, true);
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
    fetchData(selectedValue, currentPage, perPage, locale, false);
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
    if (!selectedValue || sortedColumns.length === 0) return;

    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const { data: blob } = await get("/csv-exporter/download", {
        responseType: "blob",
        params: {
          uid: selectedValue,
          locale: selectedLocale,
          timezone: timeZone,
          sortOrder: sortedColumns,
        },
      });

      const formattedDate = format(new Date(), "dd_MM_yyyy_HH_mm");
      const downloadFileName = `${selectedValue?.split(".")[1]}-export-${formattedDate}.csv`;
      setFileName(downloadFileName);

      const href = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = downloadFileName;
      link.click();
      window.URL.revokeObjectURL(href);

      setIsSuccessMessage(true);
      setTimeout(() => {
        setIsSuccessMessage(false);
      }, 8000);
    } catch (error) {
      setIsError(true);
      setTimeout(() => {
        setIsError(false);
      }, 8000);

      console.error("Error downloading csv file:", error);
      return;
    }
  };

  const fetchData = async (
    value: string,
    page: number,
    newPerPage: number,
    locale?: string,
    resetSortedColumns?: boolean,
    offsetOverride?: number,
  ) => {
    setLoading(true);
    if (value) {
      try {
        const offset = offsetOverride ?? (page - 1) * newPerPage;
        const limit = newPerPage;
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const { data: table } = await get<TableDataResponse>(
          `/csv-exporter/tabledata?uid=${value}&limit=${limit}&offset=${offset}&locale=${locale || selectedLocale}&timezone=${timeZone}`,
        );

        if (table.columns) {
          setColumns(table.columns);
          // Initialize sorted columns if not already set or if reset is requested
          if (sortedColumns.length === 0 || resetSortedColumns) {
            setSortedColumns(table.columns);
          }
        }

        if (table.data) {
          setTableData(table.data);
          setTotalRows(table.count);
        }

        return table;
      } catch (error) {
        console.error("Error fetching table data:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePageChange = (page: number) => {
    if (!selectedValue) return;
    setCurrentPage(page);
    fetchData(selectedValue, page, perPage, selectedLocale, false);
  };

  const handlePerRowsChange = async (newPerPage: number, currentPage: number) => {
    if (!selectedValue) return;

    setLoading(true);
    setPerPage(newPerPage);
    setCurrentPage(1);

    try {
      const table = await fetchData(
        selectedValue,
        currentPage,
        newPerPage,
        selectedLocale,
        false,
        0,
      );

      if (table?.data) {
        setTableData(table.data);
        setTotalRows(table.count);
      }
    } catch (error) {
      console.error("Error fetching table data:", error);
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
      alignItems="stretch"
      grow={1}
    >
      <Typography variant="alpha">CSV Export</Typography>
      <Flex gap={4} direction="row" justifyContent="space-between" alignItems="flex-end">
        <Flex gap={2} direction="column" marginTop={2} alignItems="flex-start" grow={1}>
          <label htmlFor="collectionType">
            <Typography variant="omega" fontWeight="bold">
              Collection Type
            </Typography>
          </label>
          <div style={{ maxWidth: "324px", display: "flex", alignItems: "center" }}>
            <SingleSelect
              id="collectionType"
              value={selectedValue || ""}
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
          <div style={{ maxWidth: "324px", display: "flex", alignItems: "center" }}>
            <SingleSelect
              id="locales"
              value={selectedLocale || ""}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <Button
            onClick={handleDownloadCSV}
            disabled={sortedColumns.length === 0}
            size="L"
            style={{
              width: "300px",
            }}
          >
            Download
          </Button>

          {sortedColumns.length === 0 && (
            <Status variant="warning">
              <Typography>Select at least one column to export.</Typography>
            </Status>
          )}

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
