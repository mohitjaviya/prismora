/**
 * Line items as one readable cell: "Neem Wash × 10 @ 140 = 1400; Shampoo × 5".
 * A list of objects put straight into a CSV printed "[object Object]" (H14).
 * Reads order lines (name, unitPrice, total) and return lines (product,
 * unitCost).
 */
export const itemsText = (items) => (Array.isArray(items) ? items : [])
  .map(i => {
    const name = i?.name || i?.product || '?';
    const price = i?.unitPrice ?? i?.unitCost;
    const total = i?.total ?? (price != null && i?.quantity != null ? Number(price) * Number(i.quantity) : null);
    return `${name} × ${i?.quantity ?? '?'}${price != null ? ` @ ${price}` : ''}${total != null ? ` = ${total}` : ''}`;
  })
  .join('; ');

export const downloadCSV = (data, filename) => {
  if (!data || !data.length) {
    alert("No data available to export");
    return;
  }

  // Get headers
  const headers = Object.keys(data[0]);
  
  // Format rows
  const csvRows = [];
  csvRows.push(headers.join(',')); // Add headers row

  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      const escaped = ('' + val).replace(/"/g, '""'); // Escape double quotes
      return `"${escaped}"`; // Wrap every value in quotes to handle commas
    });
    csvRows.push(values.join(','));
  }

  // Create Blob and trigger download
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
