export default [
  {
    method: 'GET',
    path: '/dropdownvalues',
    handler: 'controller.getDropdownValues',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'GET',
    path: '/get/table/data',
    handler: 'controller.getTableData',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'GET',
    path: '/download/csv',
    handler: 'controller.downloadCSV',
    config: {
      policies: [],
      auth: false,
    },
  },
];
