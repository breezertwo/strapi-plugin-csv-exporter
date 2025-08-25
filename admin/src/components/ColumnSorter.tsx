import React, { useState } from 'react';
import { Box, Flex, Typography, Button, IconButton } from '@strapi/design-system';
import { Drag, Cross } from '@strapi/icons';

interface ColumnSorterProps {
  columns: string[];
  onColumnsReorder: (newOrder: string[]) => void;
  onColumnDelete: (columnToDelete: string) => void;
  onResetColumns: () => void;
  originalColumnsCount: number;
}

const ColumnSorter: React.FC<ColumnSorterProps> = ({
  columns,
  onColumnsReorder,
  onColumnDelete,
  onResetColumns,
  originalColumnsCount,
}) => {
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [draggedOver, setDraggedOver] = useState<number | null>(null);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedItem(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', event.currentTarget.outerHTML);
    event.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (event: React.DragEvent<HTMLDivElement>) => {
    setDraggedItem(null);
    setDraggedOver(null);
    event.currentTarget.style.opacity = '1';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    setDraggedOver(index);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // Only clear draggedOver if we're leaving the entire item, not just a child element
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDraggedOver(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    event.preventDefault();

    if (draggedItem === null || draggedItem === dropIndex) {
      setDraggedItem(null);
      setDraggedOver(null);
      return;
    }

    const newColumns = [...columns];
    const draggedColumn = newColumns[draggedItem];

    // Remove the dragged item
    newColumns.splice(draggedItem, 1);

    // Insert it at the new position
    newColumns.splice(dropIndex, 0, draggedColumn);

    onColumnsReorder(newColumns);
    setDraggedItem(null);
    setDraggedOver(null);
  };

  const formatColumnName = (column: string) => {
    return column.replace(/_/g, ' ').toUpperCase();
  };

  const handleDelete = (columnToDelete: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering drag events
    onColumnDelete(columnToDelete);
  };

  return (
    <Box>
      <Flex direction="column" gap={1} marginBottom={4} alignItems={'start'}>
        <Flex justifyContent="space-between" alignItems="center" style={{ width: '100%' }}>
          <Typography variant="delta">Column Order</Typography>
          {columns.length < originalColumnsCount && (
            <Button onClick={onResetColumns} variant="tertiary" size="S">
              Reset All Columns
            </Button>
          )}
        </Flex>
        <Typography variant="omega" textColor="neutral600">
          Drag and drop to reorder columns for the table and CSV export
        </Typography>
      </Flex>
      <Flex direction="row" gap={3} wrap="wrap">
        {columns.map((column, index) => (
          <Flex
            cursor="move"
            key={column}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            gap={1}
            background="neutral0"
            hasRadius
            shadow="filterShadow"
            alignItems="center"
            justifyContent="space-between"
            style={{
              minHeight: '48px',
              paddingTop: '2px',
              paddingBottom: '2px',
              paddingLeft: '4px',
              paddingRight: '12px',
              border:
                draggedOver === index && draggedItem !== index
                  ? '2px dashed #328048'
                  : draggedItem === index
                    ? '2px solid #4945ff'
                    : '1px solid #dcdce4',
              backgroundColor:
                draggedItem === index
                  ? '#f0f0ff'
                  : draggedOver === index && draggedItem !== index
                    ? '#f6ffed'
                    : '#ecebeb',
              transform: draggedItem === index ? 'scale(1.02)' : 'none',
              boxShadow:
                draggedItem === index
                  ? '0 8px 16px rgba(0, 0, 0, 0.15)'
                  : '0 4px 8px rgba(50, 128, 72, 0.15)',
            }}
          >
            <Flex
              cursor="move"
              color={draggedItem === index ? '#4945ff' : '#8e8ea9'}
              background={draggedItem === index ? '#f0f0ff' : '#ecebeb'}
              alignItems="center"
              padding={1}
              borderRadius={1}
              transition="all 0.2s ease"
            >
              <Drag />
            </Flex>
            <Typography variant="pi" textColor="#252525">
              {formatColumnName(column)}
            </Typography>
            <IconButton
              onClick={(e) => handleDelete(column, e)}
              label={`Delete ${formatColumnName(column)} column`}
              variant="ghost"
              size="S"
              style={{
                color: '#ee5a52',
                marginLeft: '8px',
                padding: '4px',
              }}
            >
              <Cross />
            </IconButton>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
};

export { ColumnSorter };
