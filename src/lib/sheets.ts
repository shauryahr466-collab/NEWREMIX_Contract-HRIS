export async function createSpreadsheet(accessToken: string, title: string) {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message || 'Failed to create spreadsheet');
  }

  return await response.json();
}

export async function formatSpreadsheet(accessToken: string, spreadsheetId: string, sheetId: number, rowsCount: number, colsCount: number) {
  const requests = [
    // 1. Font and visibility upgrades - Data rows (11pt)
    {
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 1, endRowIndex: rowsCount },
        cell: {
          userEnteredFormat: {
            textFormat: { fontSize: 11, fontFamily: 'Inter' },
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,verticalAlignment)'
      }
    },
    // 2. Header Row Style (12pt, Bold, White text, Slate 800 background)
    {
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.117, green: 0.16, blue: 0.231 }, // Slate 800
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 12, bold: true },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // 3. Row Heights
    {
      updateDimensionProperties: {
        range: { sheetId: sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 40 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId: sheetId, dimension: 'ROWS', startIndex: 1, endIndex: rowsCount },
        properties: { pixelSize: 30 },
        fields: 'pixelSize'
      }
    },
    // 4. Auto-Fit Columns
    {
      autoResizeDimensions: {
        range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: colsCount }
      }
    },
    // 5. Borders (Thick black around header)
    {
      updateBorders: {
        range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colsCount },
        top: { style: 'SOLID_THICK', color: { red: 0, green: 0, blue: 0 } },
        bottom: { style: 'SOLID_THICK', color: { red: 0, green: 0, blue: 0 } },
        left: { style: 'SOLID_THICK', color: { red: 0, green: 0, blue: 0 } },
        right: { style: 'SOLID_THICK', color: { red: 0, green: 0, blue: 0 } }
      }
    },
    // 6. Borders (Solid outer border for data and thin inner gridlines)
    {
      updateBorders: {
        range: { sheetId: sheetId, startRowIndex: 1, endRowIndex: rowsCount, startColumnIndex: 0, endColumnIndex: colsCount },
        top: { style: 'SOLID', color: { red: 0.88, green: 0.91, blue: 0.94 } },
        bottom: { style: 'SOLID_THICK', color: { red: 0, green: 0, blue: 0 } },
        left: { style: 'SOLID_THICK', color: { red: 0, green: 0, blue: 0 } },
        right: { style: 'SOLID_THICK', color: { red: 0, green: 0, blue: 0 } },
        innerHorizontal: { style: 'SOLID', color: { red: 0.88, green: 0.91, blue: 0.94 } },
        innerVertical: { style: 'SOLID', color: { red: 0.88, green: 0.91, blue: 0.94 } }
      }
    },
    // 7. Center Status Column (Assuming it is the last column)
    {
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: rowsCount, startColumnIndex: colsCount - 1, endColumnIndex: colsCount },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment)'
      }
    }
  ];

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
}

export async function appendDataToSheet(accessToken: string, spreadsheetId: string, range: string, values: any[][]) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: values,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message || 'Failed to append data');
  }

  return await response.json();
}

export async function clearSheet(accessToken: string, spreadsheetId: string, range: string) {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });
  
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error.message || 'Failed to clear sheet');
    }
  
    return await response.json();
  }
