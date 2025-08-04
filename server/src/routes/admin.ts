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
    path: '/tabledata',
    handler: 'controller.getTableData',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'GET',
    path: '/download',
    handler: 'controller.downloadCSV',
    config: {
      policies: [],
      auth: false,
    },
  },
];
