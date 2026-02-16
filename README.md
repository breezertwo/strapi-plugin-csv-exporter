# Strapi Plugin CSV Exporter

A highly configurable Strapi plugin that allows you to export your content types as CSV files with drag-and-drop interface for column management.

<p align="center">
  <a href="https://www.npmjs.com/package/strapi-plugin-csv-exporter">
    <img src="https://img.shields.io/npm/v/strapi-plugin-csv-exporter?style=flat-square&color=blue" alt="NPM Version" />
  </a>
  <a href="https://github.com/strapi/strapi">
    <img src="https://img.shields.io/badge/strapi-v5.0.0+-green?style=flat-square" alt="Strapi Version" />
  </a>
  <a href="https://github.com/breezertwo/strapi-plugin-csv-exporter/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/strapi-plugin-csv-exporter?style=flat-square" alt="License" />
  </a>
</p>

## ✨ Features

- **Easy CSV Export**: Export your Strapi collections to CSV format
- **Interactive Table Preview**: View your data before export in the Admin Panel
- **Flexible Configuration**: Configure which content types, collumns & relations are available for export
- **Drag & Drop Column Reordering**: Reorder columns for both table display and CSV output in the Admin Panel
- **i18n Support**: Export your content types based on your configured locales
- **Permission Management**: Select which users can use the plugin with a specific permission
- **Custom Filtering**: Apply optional filters as you would do with Strapi Document API
- **TypeScript Support**: Write the configuration file in TypeScript for better type safety

<img src="https://i.postimg.cc/85fbvXK6/screenshot.png" alt="Strapi Plugin CSV Exporter screenshot" width="1000">

## 📦 Installation

```bash
npm install strapi-plugin-csv-exporter
```

_Minimum Strapi Version needed: v5_

## 🚀 Quick Start

1. **Install the plugin**

2. **Enable the plugin** in your `config/plugins.ts`:

```javascript
module.exports = {
  'csv-exporter': {
    enabled: true,
  },
};
```

3. **Create** `config/csv-exporter.ts` in your Strapi project:

```javascript
// for strapi tsconfig
//  "module": "CommonJS",
//  "moduleResolution": "Node",
// use
//
// import type { CSVExporterPlugin } from "strapi-plugin-csv-exporter/dist/server/src";
//
// for
//  "module": "Node16",
//  "moduleResolution": "Node16",
import type { CSVExporterPlugin } from "strapi-plugin-csv-exporter/strapi-server";

module.exports = (): CSVExporterPlugin => ({
  // Content type specific configurations
  config: {
    // Configuration for articles content type
    'api::article.article': {
      // Label shown in the dropdown
      dropdownLabel: 'Published articles',

      // Columns to export
      columns: ['title', 'createdAt'],

      // Relations as column (optional)
      relation: {
        author: {
          column: ['name'],
        }
      },

      // Filters to apply to the query (optional)
      filter: {
        title: {
          $contains: 'Hello',
        },
      },

      // Status (draft or published, optional)
      status: 'published', // defaults to draft if not provided

      // Custom columns to add to the table
      customColumns: {
        'customColumnName': { // This will be used as collumn title
          // item contains the element containing all columns and relations to build a custom column
          column: (item) => `custom string result with id: ${item.id}`
        }
      }

    },
  },

  // Optional: Global date formatting for all fields that are a valid ISO Date
  dateFormat: 'dd/MM/yyyy HH:mm', // default
  // Optional: Set a *global* IANA time zone identifier or UTC offset (e.g. 'Europe/Berlin' or '+02:00'). Per default, the current timezone of the client will be used to format timestamps. If no timezone can be determined, default will be UTC+00:00)
  timeZone: '+00:00', // default
  // Optional: Fields to globally ignore in exports
  ignore: [], // default
});
```

4. **Build and restart** your Strapi application

5. **Add Permission** Enable your users to use the plugin in the permissions settings

## 🖥️ Usage

### Accessing the Plugin

1. Log into your Strapi admin panel
2. Enable the plugin for your users in the permissions settings
3. Navigate to **CSV Exporter** in your side bar panel
4. The plugin interface will load with your configured content types in the dropdown

### Using the Interface

#### 1. Select Content Type

- Use the dropdown to select which content type to export
- Only configured content types will appear in the list
- The table shows a preview of your data

#### 2. Manage Columns

**Reorder Columns:**

- Drag and drop column items to reorder them
- The table and CSV export will use this new order

**Delete Columns:**

- Click the ❌ button on any column to remove it
- Deleted columns won't appear in the table or CSV export

#### 3. Download CSV

- Click the "Download" button to generate and download your CSV
- Format: `{content-type}-export-{dd_MM_yyyy_HH_mm}.csv`

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE.md) file for details.

If you find this plugin helpful, please consider:

- ⭐ **Starring** the repository
- 🐛 **Reporting** bugs and issues
- 🤝 **Contributing** to the project
- 💡 **Suggesting** new features
- 📣 **Sharing** with others who might benefit
