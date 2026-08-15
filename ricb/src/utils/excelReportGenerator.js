const XLSX = require('xlsx');

// Render an item's generic category custom fields (e.g. Drug Name, Strength,
// Equipment Type) as one "Label: value" string, falling back to specifications.
const formatItemDetails = (item) => {
  if (Array.isArray(item.custom_fields) && item.custom_fields.length > 0) {
    return item.custom_fields.map(f => `${f.label}: ${f.value}`).join(', ');
  }
  return item.specifications || '';
};

// The consumption amount/type store actually entered during fulfillment (e.g.
// "12 (yearly)") - previously this column showed a bogus quantity/12 guess
// that ignored what was actually entered.
const formatConsumption = (item) => {
  const amount = item.consumption_amount;
  if (amount === undefined || amount === null || amount === '') return '';
  return `${amount} (${item.consumption_type || 'yearly'})`;
};

const generateDemandReport = (reportData) => {
  const { demand, items } = reportData;

  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  // Extract organization and report info
  const organizationName = demand.department?.toUpperCase() || 'RAWALPINDI INSTITUTE OF CARDIOLOGY, RAWALPINDI';

  // Generate current and next fiscal year
  const currentYear = new Date().getFullYear();
  const fiscalYear = `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;

  // Report title: name it after the category when every item shares one,
  // otherwise use a generic title (mirrors the old category-specific titles
  // without hardcoding pharma/equipment keywords).
  const categoryNames = [...new Set(items.map(item => item.category).filter(Boolean))];
  const reportTitle = categoryNames.length === 1
    ? `ANNUAL TENDER OF ${categoryNames[0].toUpperCase()} FY ${fiscalYear}`
    : `ANNUAL TENDER OF SUPPLIES & MATERIALS FY ${fiscalYear}`;

  // Prepare data for Excel with padding (1 row and 1 column)
  const excelData = [];

  // Add padding row
  excelData.push([]);

  // Header rows with left padding (will be centered via styling)
  excelData.push(['', organizationName]);
  excelData.push(['', reportTitle]);
  excelData.push(['']); // Empty row with padding

  // Table headers - generic, works for any category's custom fields
  const tableHeaders = [
    '', // Left padding column
    'S. No',
    'Item Name',
    'Details',
    'Category',
    'Unit',
    `Qty ${currentYear-1}-${currentYear.toString().slice(-2)}`,
    'Consumption',
    `Qty Req. ${currentYear}-${(currentYear+1).toString().slice(-2)}`,
    'Estimated Unit Rate',
    'Total Estimated Cost'
  ];

  excelData.push(tableHeaders);

  // Group items by category
  const itemsByCategory = {};
  items.forEach(item => {
    const categoryName = item.category || 'Other Items';
    if (!itemsByCategory[categoryName]) {
      itemsByCategory[categoryName] = [];
    }
    itemsByCategory[categoryName].push(item);
  });

  let serialNumber = 1;

  // Process each category
  Object.entries(itemsByCategory).forEach(([categoryName, categoryItems]) => {
    // Add category header with padding
    excelData.push(['']);
    excelData.push(['', `SECTION – ${Object.keys(itemsByCategory).indexOf(categoryName) + 1}`]);
    excelData.push(['', categoryName.toUpperCase()]);
    
    // Add items in this category
    categoryItems.forEach((item) => {
      const totalEstimatedCost = (item.quantity || 0) * (item.current_year_cost || 0);

      const itemData = [
        '', // Left padding column
        serialNumber,
        item.name || '',
        formatItemDetails(item),
        item.category || '',
        item.unit || 'Unit',
        (item.previous_year_cost || item.prev_year_cost || 0),
        formatConsumption(item),
        item.quantity || 0,
        item.current_year_cost || 0,
        totalEstimatedCost
      ];

      excelData.push(itemData);

      serialNumber++;
    });
  });

  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(excelData);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 3 },   // Padding column
    { wch: 8 },   // S. No
    { wch: 30 },  // Generic Name
    { wch: 12 },  // Strength
    { wch: 15 },  // Preparation
    { wch: 18 },  // Dosage Form
    { wch: 15 },  // Qty 2024-25
    { wch: 18 },  // Monthly Consumption
    { wch: 18 },  // Qty Req. 2025-26
    { wch: 18 },  // Estimated Unit Rate
    { wch: 20 }   // Total Estimated Cost
  ];

  // Get the range of the worksheet
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  
  // Merge cells for organization name and report title (span across all columns)
  const lastColumn = Math.max(10, range.e.c);
  if (!worksheet['!merges']) worksheet['!merges'] = [];
  worksheet['!merges'].push({ s: { r: 1, c: 1 }, e: { r: 1, c: lastColumn } }); // Organization name
  worksheet['!merges'].push({ s: { r: 2, c: 1 }, e: { r: 2, c: lastColumn } }); // Report title

  // Find table boundaries for highlighted borders
  let tableStartRow = 4; // Header row
  let tableEndRow = range.e.r;
  let tableStartCol = 1; // Skip padding column
  let tableEndCol = lastColumn;

  // Apply professional styling
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell_address = { c: C, r: R };
      const cell_ref = XLSX.utils.encode_cell(cell_address);
      
      if (!worksheet[cell_ref]) continue;
      
      // Initialize cell style
      if (!worksheet[cell_ref].s) worksheet[cell_ref].s = {};
      
      // Organization name styling (Row 1, Merged) - CENTERED
      if (R === 1 && C >= 1) {
        worksheet[cell_ref].s = {
          font: { 
            name: 'Arial Black', 
            sz: 18, 
            bold: true, 
            color: { rgb: "1F4E79" } 
          },
          alignment: { 
            horizontal: "center", 
            vertical: "center" 
          },
          fill: { 
            fgColor: { rgb: "E7F3FF" } 
          },
          border: {
            top: { style: "thick", color: { rgb: "1F4E79" } },
            bottom: { style: "thick", color: { rgb: "1F4E79" } },
            left: { style: "thick", color: { rgb: "1F4E79" } },
            right: { style: "thick", color: { rgb: "1F4E79" } }
          }
        };
      }
      
      // Report title styling (Row 2, Merged) - CENTERED
      else if (R === 2 && C >= 1) {
        worksheet[cell_ref].s = {
          font: { 
            name: 'Arial', 
            sz: 16, 
            bold: true, 
            color: { rgb: "7030A0" } 
          },
          alignment: { 
            horizontal: "center", 
            vertical: "center" 
          },
          fill: { 
            fgColor: { rgb: "F2E7FE" } 
          },
          border: {
            top: { style: "medium", color: { rgb: "7030A0" } },
            bottom: { style: "medium", color: { rgb: "7030A0" } },
            left: { style: "medium", color: { rgb: "7030A0" } },
            right: { style: "medium", color: { rgb: "7030A0" } }
          }
        };
      }
      
      // Table headers styling (Row 4) with BLACK HIGHLIGHTED BORDERS
      else if (R === tableStartRow && C >= tableStartCol) {
        worksheet[cell_ref].s = {
          font: { 
            name: 'Calibri', 
            sz: 12, 
            bold: true, 
            color: { rgb: "FFFFFF" } 
          },
          alignment: { 
            horizontal: "center", 
            vertical: "center", 
            wrapText: true 
          },
          fill: { 
            fgColor: { rgb: "2F5597" } 
          },
          border: {
            top: { style: "thick", color: { rgb: "000000" } },
            bottom: { style: "thick", color: { rgb: "000000" } },
            left: { style: "thick", color: { rgb: "000000" } },
            right: { style: "thick", color: { rgb: "000000" } }
          }
        };
      }
      
      // Section headers styling
      else if (C === 1 && worksheet[cell_ref].v && 
               (String(worksheet[cell_ref].v).startsWith('SECTION') || 
                String(worksheet[cell_ref].v).match(/^[A-Z\s]+$/))) {
        worksheet[cell_ref].s = {
          font: { 
            name: 'Calibri', 
            sz: 12, 
            bold: true, 
            color: { rgb: "C5504B" } 
          },
          alignment: { 
            horizontal: "left", 
            vertical: "center" 
          },
          fill: { 
            fgColor: { rgb: "FCE4D6" } 
          },
          border: {
            top: { style: "thin", color: { rgb: "C5504B" } },
            bottom: { style: "thin", color: { rgb: "C5504B" } },
            left: { style: "thin", color: { rgb: "C5504B" } },
            right: { style: "thin", color: { rgb: "C5504B" } }
          }
        };
      }
      
      // Data rows styling with highlighted table borders
      else if (R > tableStartRow && C >= tableStartCol && C <= tableEndCol && worksheet[cell_ref].v !== undefined) {
        const isEvenRow = (R % 2 === 0);
        const isFirstDataCol = (C === tableStartCol);
        const isLastDataCol = (C === tableEndCol);
        const isLastDataRow = (R === tableEndRow);
        
        worksheet[cell_ref].s = {
          font: { 
            name: 'Calibri', 
            sz: 10, 
            color: { rgb: "404040" } 
          },
          alignment: { 
            horizontal: C === tableStartCol ? "center" : (C === tableStartCol + 1 ? "left" : "center"), 
            vertical: "center" 
          },
          fill: { 
            fgColor: { rgb: isEvenRow ? "F9F9F9" : "FFFFFF" } 
          },
          border: {
            top: { style: "thin", color: { rgb: "D9D9D9" } },
            bottom: isLastDataRow ? { style: "thick", color: { rgb: "000000" } } : { style: "thin", color: { rgb: "D9D9D9" } },
            left: isFirstDataCol ? { style: "thick", color: { rgb: "000000" } } : { style: "thin", color: { rgb: "D9D9D9" } },
            right: isLastDataCol ? { style: "thick", color: { rgb: "000000" } } : { style: "thin", color: { rgb: "D9D9D9" } }
          }
        };
        
        // Special formatting for numeric columns
        if (C >= 6 && C <= 10) { // Quantity and cost columns
          worksheet[cell_ref].s.numFmt = C === 9 || C === 10 ? '#,##0.00' : '#,##0';
          if (C === 10) { // Total cost column
            worksheet[cell_ref].s.font.bold = true;
            worksheet[cell_ref].s.font.color = { rgb: "0B5345" };
          }
        }
      }
    }
  }

  // Set row heights for better presentation
  if (!worksheet['!rows']) worksheet['!rows'] = [];
  worksheet['!rows'][1] = { hpt: 30 }; // Organization name - increased height
  worksheet['!rows'][2] = { hpt: 25 }; // Report title - increased height
  worksheet['!rows'][4] = { hpt: 35 }; // Table headers - increased height

  // Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Demand Report');

  // Return buffer instead of writing file
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const generateTenderReport = (tenderData) => {
  // Create a new workbook with professional styling
  const workbook = XLSX.utils.book_new();
  
  const reportData = [];
  
  // Add padding row
  reportData.push([]);
  
  // Header rows with left padding (will be centered via styling)
  reportData.push(['', 'RAWALPINDI INSTITUTE OF CARDIOLOGY, RAWALPINDI']);
  
  // Determine tender title (generic - names the category when items share one)
  const items = tenderData.items || [];
  const categoryNames = [...new Set(items.map(item => item.category).filter(Boolean))];
  const tenderTitle = categoryNames.length === 1
    ? `TENDER DOCUMENT - ${categoryNames[0].toUpperCase()}`
    : `TENDER DOCUMENT - ${tenderData.title || 'SUPPLIES & MATERIALS'}`;

  reportData.push(['', tenderTitle]);
  reportData.push(['']); // Empty row with padding

  // Tender details section
  reportData.push(['', 'TENDER INFORMATION']);
  reportData.push(['', 'Tender ID:', tenderData.id || 'N/A']);
  reportData.push(['', 'Opening Date:', tenderData.openingDate || 'TBD']);
  reportData.push(['', 'Submission Deadline:', tenderData.submissionDeadline || 'TBD']);
  reportData.push(['']); // Empty row

  // Items table headers - generic, works for any category's custom fields
  const tableHeaders = [
    '', // Left padding column
    'S. No',
    'Item Description',
    'Details',
    'Unit',
    'Quantity Required',
    'Estimated Rate (PKR)',
    'Total Estimated Cost (PKR)'
  ];

  reportData.push(tableHeaders);

  // Add items data
  items.forEach((item, index) => {
    const itemRow = [
      '', // Left padding column
      index + 1,
      item.description || item.name || item.item_name || 'N/A',
      formatItemDetails(item),
      item.unit || 'Unit',
      item.quantity || 0,
      item.estimatedRate || 0,
      (item.quantity || 0) * (item.estimatedRate || 0)
    ];

    reportData.push(itemRow);
  });

  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(reportData);
  
  // Set column widths
  worksheet['!cols'] = [
    { wch: 3 },   // Padding column
    { wch: 8 },   // S. No
    { wch: 30 },  // Item Name
    { wch: 20 },  // Specification
    { wch: 12 },  // Unit
    { wch: 18 },  // Quantity Required
    { wch: 20 },  // Estimated Rate
    { wch: 25 }   // Total Estimated Cost
  ];

  // Apply similar styling as demand report
  // (styling code similar to above...)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tender Report');

  // Return buffer instead of writing file
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
  generateDemandReport,
  generateTenderReport
};
