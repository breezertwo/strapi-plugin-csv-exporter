# Strapi Plugin CSV Exporter

A highly configurable Strapi plugin that allows you to export your content types as CSV files with drag-and-drop interface for column management.

![Plugin Version](https://img.shields.io/badge/version-5.4.2-blue)
![Strapi Version](https://img.shields.io/badge/strapi-v5.0.0+-green)
![License](https://img.shields.io/badge/license-MIT-green)

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

Minimum Strapi Version needed: v5

```bash
npm install strapi-plugin-csv-exporter
```

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

      // Optional relations as column
      relation: {
        author: {
          column: ['name'],
        }
      },

      // Optional filters to apply to the query
      filter: {
        publishedAt: {
          $ne: null,
        },
      },

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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

- Built for [Strapi](https://strapi.io/) - The leading open-source headless CMS
- Uses [Strapi Design System](https://design-system.strapi.io/) for UI components

---

<div align="center">
  <strong>⭐ If this plugin helped you, please consider giving it a star on GitHub! ⭐</strong>
</div>
