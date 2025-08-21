import React, { useState } from 'react';
import { Box, Flex, Typography, Button } from '@strapi/design-system';
import { Drag } from '@strapi/icons';

interface ColumnSorterProps {
  columns: string[];
  onColumnsReorder: (newOrder: string[]) => void;
}

const ColumnSorter: React.FC<ColumnSorterProps> = ({ columns, onColumnsReorder }) => {
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

  return (
    <Box>
      <Flex direction="column" gap={1} marginBottom={4} alignItems={'start'}>
        <Typography variant="delta">Column Order</Typography>
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
              paddingTop: '4px',
              paddingBottom: '4px',
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
                    : 'white',
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
              background={draggedItem === index ? '#f0f0ff' : 'white'}
              alignItems="center"
              padding={1}
              borderRadius={1}
              transition="all 0.2s ease"
            >
              <Drag />
            </Flex>
            <Typography variant="pi" textColor="black">
              {formatColumnName(column)}
            </Typography>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
};

export { ColumnSorter };
