# Strapi Plugin CSV Exporter

A highly configurable Strapi plugin that allows you to export your content types as CSV files with drag-and-drop interface for column management.

![Plugin Version](https://img.shields.io/badge/version-5.1.0-blue)
![Strapi Version](https://img.shields.io/badge/strapi-v5.0.0+-green)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **Easy CSV Export**: Export your Strapi collections to CSV format
- **Interactive Table Preview**: View your data before export with pagination
- **Flexible Configuration**: Configure which content types, collumns & relations are available for export
- **Drag & Drop Column Reordering**: Visually reorder columns for both table display and CSV output in the Admin Panel
- **Column Management**: Delete unwanted columns from exports
- **Custom Filtering**: Apply filters as you would do with Strapi Document API

## 📦 Installation

```bash
npm install strapi-plugin-csv-exporter
```

## 🚀 Quick Start

1. **Install the plugin** (see installation instructions above)

2. **Enable the plugin** in your `config/plugins.js`:

```javascript
module.exports = {
  'csv-exporter': {
    enabled: true,
  },
};
```

3. **Create** `config/csv-exporter.js` in your Strapi project:

```javascript
module.exports = (): CSVExporterPlugin => ({
  // Content type specific configurations
  config: {
    // Configuration for articles content type
    'api::article.article': {
      // Label shown in the dropdown
      dropdownLabel: 'Published articles',

      // Columns to export
      columns: ['title', 'createdAt'],

      // Optional relations as collumn
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

  // Global date formatting (using date-fns format)
  dateFormat: 'dd/MM/yyyy HH:mm',
  // Fields to globally ignore in exports
  ignore: ['documentId'],
};
```

4. **Build and restart** your Strapi application:

## 🖥️ Usage

### Accessing the Plugin

1. Log into your Strapi admin panel
2. Navigate to **CSV Exporter** in your side bar panel
3. The plugin interface will load with your configured content types in the dropdown

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
