import * as XLSX from 'xlsx';

export const generateDemandReport = (demand, items) => {
  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  // Extract organization and report info
  const organizationName = demand.departmentName?.toUpperCase() || 'RAWALPINDI INSTITUTE OF CARDIOLOGY, RAWALPINDI';
  
  // Determine the main category type and set appropriate title
  const categoryTypes = items.map(item => item.categoryName?.toLowerCase() || '');
  const isPrimarilyPharmaceutical = categoryTypes.some(cat => 
    cat.includes('pharmaceutical') || cat.includes('medicine') || cat.includes('drug')
  );
  const isPrimarilyEquipment = categoryTypes.some(cat => 
    cat.includes('equipment') || cat.includes('machinery') || cat.includes('instrument')
  );
  
  // Generate current and next fiscal year
  const currentYear = new Date().getFullYear();
  const fiscalYear = `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
  
  // Set appropriate report title based on category
  let reportTitle;
  if (isPrimarilyPharmaceutical) {
    reportTitle = `ANNUAL TENDER OF MEDICINE & DRUGS FY ${fiscalYear}`;
  } else if (isPrimarilyEquipment) {
    reportTitle = `ANNUAL TENDER OF MEDICAL EQUIPMENT & INSTRUMENTS FY ${fiscalYear}`;
  } else {
    reportTitle = `ANNUAL TENDER OF SUPPLIES & MATERIALS FY ${fiscalYear}`;
  }

  // Prepare data for Excel with padding (1 row and 1 column)
  const reportData = [];
  
  // Add padding row
  reportData.push([]);
  
  // Header rows with left padding (will be centered via styling)
  reportData.push(['', organizationName]);
  reportData.push(['', reportTitle]);
  reportData.push(['']); // Empty row with padding
  
  // Set appropriate table headers based on category type
  let tableHeaders;
  if (isPrimarilyPharmaceutical) {
    tableHeaders = [
      '', // Left padding column
      'S. No',
      'Generic Name',
      'Strength',
      'Preparation',
      'Dosage Form / Unit',
      `Qty ${currentYear-1}-${currentYear.toString().slice(-2)}`,
      'Monthly Consumption',
      `Qty Req. ${currentYear}-${(currentYear+1).toString().slice(-2)}`,
      'Estimated Unit Rate',
      'Total Estimated Cost'
    ];
  } else if (isPrimarilyEquipment) {
    tableHeaders = [
      '', // Left padding column
      'S. No',
      'Equipment Name',
      'Model/Specification',
      'Category',
      'Unit',
      `Qty ${currentYear-1}-${currentYear.toString().slice(-2)}`,
      'Monthly Requirement',
      `Qty Req. ${currentYear}-${(currentYear+1).toString().slice(-2)}`,
      'Estimated Unit Rate',
      'Total Estimated Cost'
    ];
  } else {
    tableHeaders = [
      '', // Left padding column
      'S. No',
      'Item Name',
      'Specification',
      'Category',
      'Unit',
      `Qty ${currentYear-1}-${currentYear.toString().slice(-2)}`,
      'Monthly Consumption',
      `Qty Req. ${currentYear}-${(currentYear+1).toString().slice(-2)}`,
      'Estimated Unit Rate',
      'Total Estimated Cost'
    ];
  }
  
  reportData.push(tableHeaders);

  // Group items by category
  const itemsByCategory = {};
  items.forEach(item => {
    const categoryName = item.categoryName || 'Other Items';
    if (!itemsByCategory[categoryName]) {
      itemsByCategory[categoryName] = [];
    }
    itemsByCategory[categoryName].push(item);
  });

  let serialNumber = 1;

  // Process each category
  Object.entries(itemsByCategory).forEach(([categoryName, categoryItems]) => {
    // Add category header with padding
    reportData.push(['']);
    reportData.push(['', `SECTION – ${serialNumber}`]);
    reportData.push(['', categoryName.toUpperCase()]);
    
    // Add items in this category
    categoryItems.forEach((item, index) => {
      const monthlyConsumption = item.prevYearQuantity ? Math.round(item.prevYearQuantity / 12) : 0;
      const totalEstimatedCost = (item.requestedQuantity || 0) * (item.prevYearCost || 0);
      
      // Build item data based on item type
      let itemData;
      
      if (isPrimarilyPharmaceutical) {
        // For pharmaceutical items
        const genericName = item.drugName || item.itemName || '';
        const strength = (item.strengthValue && item.strengthUnit) ? 
          `${item.strengthValue}${item.strengthUnit}` : '';
        const preparation = item.preparation || 'Oral';
        const dosageForm = item.dosageForm || 'Tab';
        
        itemData = [
          '', // Left padding column
          serialNumber,
          genericName,
          strength,
          preparation,
          dosageForm,
          item.prevYearQuantity || 0,
          monthlyConsumption,
          item.requestedQuantity || 0,
          item.prevYearCost || 0,
          totalEstimatedCost
        ];
      } else if (isPrimarilyEquipment) {
        // For equipment items
        const equipmentName = item.equipmentType || item.itemName || '';
        const specification = item.specifications || item.model || '';
        const category = item.equipmentCategory || item.categoryName || '';
        const unit = item.unit || 'Unit';
        
        itemData = [
          '', // Left padding column
          serialNumber,
          equipmentName,
          specification,
          category,
          unit,
          item.prevYearQuantity || 0,
          monthlyConsumption,
          item.requestedQuantity || 0,
          item.prevYearCost || 0,
          totalEstimatedCost
        ];
      } else {
        // For general items
        const itemName = item.itemName || '';
        const specification = item.specifications || '';
        const category = item.categoryName || '';
        const unit = item.unit || 'Unit';
        
        itemData = [
          '', // Left padding column
          serialNumber,
          itemName,
          specification,
          category,
          unit,
          item.prevYearQuantity || 0,
          monthlyConsumption,
          item.requestedQuantity || 0,
          item.prevYearCost || 0,
          totalEstimatedCost
        ];
      }

      reportData.push(itemData);
      
      serialNumber++;
    });
  });

  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(reportData);

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

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `Demand_Report_${demand.id}_${timestamp}.xlsx`;

  // Download the file
  XLSX.writeFile(workbook, filename);

  return filename;
};

export const generateTenderReport = (tenderData) => {
  // Create a new workbook with professional styling
  const workbook = XLSX.utils.book_new();
  
  const reportData = [];
  
  // Add padding row
  reportData.push([]);
  
  // Header rows with left padding (will be centered via styling)
  reportData.push(['', 'RAWALPINDI INSTITUTE OF CARDIOLOGY, RAWALPINDI']);
  
  // Determine appropriate tender title based on content
  const items = tenderData.items || [];
  const categoryTypes = items.map(item => item.categoryName?.toLowerCase() || '');
  const isPrimarilyPharmaceutical = categoryTypes.some(cat => 
    cat.includes('pharmaceutical') || cat.includes('medicine') || cat.includes('drug')
  );
  const isPrimarilyEquipment = categoryTypes.some(cat => 
    cat.includes('equipment') || cat.includes('machinery') || cat.includes('instrument')
  );
  
  let tenderTitle;
  if (isPrimarilyPharmaceutical) {
    tenderTitle = `TENDER DOCUMENT - MEDICINE & DRUGS`;
  } else if (isPrimarilyEquipment) {
    tenderTitle = `TENDER DOCUMENT - MEDICAL EQUIPMENT & INSTRUMENTS`;
  } else {
    tenderTitle = `TENDER DOCUMENT - ${tenderData.title || 'SUPPLIES & MATERIALS'}`;
  }
  
  reportData.push(['', tenderTitle]);
  reportData.push(['']); // Empty row with padding
  
  // Tender details section
  reportData.push(['', 'TENDER INFORMATION']);
  reportData.push(['', 'Tender ID:', tenderData.id || 'N/A']);
  reportData.push(['', 'Opening Date:', tenderData.openingDate || 'TBD']);
  reportData.push(['', 'Submission Deadline:', tenderData.submissionDeadline || 'TBD']);
  reportData.push(['']); // Empty row
  
  // Items table headers with padding - dynamic based on content type
  let tableHeaders;
  if (isPrimarilyPharmaceutical) {
    tableHeaders = [
      '', // Left padding column
      'S. No',
      'Generic Name',
      'Strength',
      'Dosage Form',
      'Quantity Required',
      'Estimated Rate (PKR)',
      'Total Estimated Cost (PKR)'
    ];
  } else if (isPrimarilyEquipment) {
    tableHeaders = [
      '', // Left padding column
      'S. No',
      'Equipment Name',
      'Model/Specification',
      'Unit',
      'Quantity Required',
      'Estimated Rate (PKR)',
      'Total Estimated Cost (PKR)'
    ];
  } else {
    tableHeaders = [
      '', // Left padding column
      'S. No',
      'Item Description',
      'Specification',
      'Unit',
      'Quantity Required',
      'Estimated Rate (PKR)',
      'Total Estimated Cost (PKR)'
    ];
  }
  
  reportData.push(tableHeaders);

  // Add items data with appropriate formatting
  tenderData.items?.forEach((item, index) => {
    let itemRow;
    
    if (isPrimarilyPharmaceutical) {
      const genericName = item.drugName || item.itemName || item.description || 'N/A';
      const strength = (item.strengthValue && item.strengthUnit) ? 
        `${item.strengthValue}${item.strengthUnit}` : '';
      const dosageForm = item.dosageForm || item.unit || 'Unit';
      
      itemRow = [
        '', // Left padding column
        index + 1,
        genericName,
        strength,
        dosageForm,
        item.quantity || 0,
        item.estimatedRate || 0,
        (item.quantity || 0) * (item.estimatedRate || 0)
      ];
    } else if (isPrimarilyEquipment) {
      const equipmentName = item.equipmentType || item.itemName || item.description || 'N/A';
      const specification = item.specifications || item.model || '';
      const unit = item.unit || 'Unit';
      
      itemRow = [
        '', // Left padding column
        index + 1,
        equipmentName,
        specification,
        unit,
        item.quantity || 0,
        item.estimatedRate || 0,
        (item.quantity || 0) * (item.estimatedRate || 0)
      ];
    } else {
      itemRow = [
        '', // Left padding column
        index + 1,
        item.description || item.itemName || 'N/A',
        item.specifications || '',
        item.unit || 'Unit',
        item.quantity || 0,
        item.estimatedRate || 0,
        (item.quantity || 0) * (item.estimatedRate || 0)
      ];
    }
    
    reportData.push(itemRow);
  });

  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(reportData);
  
  // Set column widths based on table type
  if (isPrimarilyPharmaceutical) {
    worksheet['!cols'] = [
      { wch: 3 },   // Padding column
      { wch: 8 },   // S. No
      { wch: 30 },  // Generic Name
      { wch: 15 },  // Strength
      { wch: 15 },  // Dosage Form
      { wch: 18 },  // Quantity Required
      { wch: 20 },  // Estimated Rate
      { wch: 25 }   // Total Estimated Cost
    ];
  } else if (isPrimarilyEquipment) {
    worksheet['!cols'] = [
      { wch: 3 },   // Padding column
      { wch: 8 },   // S. No
      { wch: 25 },  // Equipment Name
      { wch: 20 },  // Model/Specification
      { wch: 12 },  // Unit
      { wch: 18 },  // Quantity Required
      { wch: 20 },  // Estimated Rate
      { wch: 25 }   // Total Estimated Cost
    ];
  } else {
    worksheet['!cols'] = [
      { wch: 3 },   // Padding column
      { wch: 8 },   // S. No
      { wch: 30 },  // Item Description
      { wch: 20 },  // Specification
      { wch: 12 },  // Unit
      { wch: 18 },  // Quantity Required
      { wch: 20 },  // Estimated Rate
      { wch: 25 }   // Total Estimated Cost
    ];
  }

  // Get the range of the worksheet
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  
  // Merge cells for headers (span across all columns)
  const lastColumn = Math.max(7, range.e.c);
  if (!worksheet['!merges']) worksheet['!merges'] = [];
  worksheet['!merges'].push({ s: { r: 1, c: 1 }, e: { r: 1, c: lastColumn } }); // Organization name
  worksheet['!merges'].push({ s: { r: 2, c: 1 }, e: { r: 2, c: lastColumn } }); // Tender title
  worksheet['!merges'].push({ s: { r: 4, c: 1 }, e: { r: 4, c: lastColumn } }); // Tender information header

  // Find table boundaries for highlighted borders
  let tableStartRow = 9; // Table header row
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
      
      // Organization name styling (Row 1) - CENTERED
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
      
      // Tender title styling (Row 2) - CENTERED
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
      
      // Tender information header (Row 4)
      else if (R === 4 && C >= 1) {
        worksheet[cell_ref].s = {
          font: { 
            name: 'Calibri', 
            sz: 12, 
            bold: true, 
            color: { rgb: "C5504B" } 
          },
          alignment: { 
            horizontal: "center", 
            vertical: "center" 
          },
          fill: { 
            fgColor: { rgb: "FCE4D6" } 
          },
          border: {
            top: { style: "medium", color: { rgb: "C5504B" } },
            bottom: { style: "medium", color: { rgb: "C5504B" } },
            left: { style: "medium", color: { rgb: "C5504B" } },
            right: { style: "medium", color: { rgb: "C5504B" } }
          }
        };
      }
      
      // Table headers styling (Row 9) with BLACK HIGHLIGHTED BORDERS
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
      
      // Tender details styling (Rows 5-7)
      else if ((R >= 5 && R <= 7) && C === 1) {
        worksheet[cell_ref].s = {
          font: { 
            name: 'Calibri', 
            sz: 10, 
            bold: true, 
            color: { rgb: "404040" } 
          },
          alignment: { 
            horizontal: "left", 
            vertical: "center" 
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
        if (C >= 5 && C <= 7) { // Rate and cost columns (adjusted for different table structures)
          worksheet[cell_ref].s.numFmt = C === 6 || C === 7 ? '#,##0.00' : '#,##0';
          if (C === 7) { // Total cost column
            worksheet[cell_ref].s.font.bold = true;
            worksheet[cell_ref].s.font.color = { rgb: "0B5345" };
          }
        } else if (C === 5) { // Quantity column
          worksheet[cell_ref].s.numFmt = '#,##0';
        }
      }
    }
  }

  // Set row heights for better presentation
  if (!worksheet['!rows']) worksheet['!rows'] = [];
  worksheet['!rows'][1] = { hpt: 30 }; // Organization name - increased height
  worksheet['!rows'][2] = { hpt: 25 }; // Tender title - increased height
  worksheet['!rows'][4] = { hpt: 18 }; // Tender information header
  worksheet['!rows'][9] = { hpt: 35 }; // Table headers - increased height

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tender Report');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `Tender_Report_${tenderData.id}_${timestamp}.xlsx`;
  
  XLSX.writeFile(workbook, filename);
  return filename;
};
