export default [
  {
    method: 'GET',
    path: '/dropdownvalues',
    handler: 'controller.getDropdownValues',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'plugin::content-manager.hasPermissions',
          config: { actions: ['plugin::csv-exporter.usage'] },
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/tabledata',
    handler: 'controller.getTableData',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'plugin::content-manager.hasPermissions',
          config: { actions: ['plugin::csv-exporter.usage'] },
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/download',
    handler: 'controller.downloadCSV',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'plugin::content-manager.hasPermissions',
          config: { actions: ['plugin::csv-exporter.usage'] },
        },
      ],
    },
  },
];
