console.log('Starting Excel generation test...');

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function main() {
    try {
        console.log('Creating workbook...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Technical Evaluation Report');

        console.log('Adding title...');
        worksheet.mergeCells('A1:E1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'Technical Evaluation Report - Test';
        titleCell.font = { bold: true, size: 16 };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        console.log('Adding headers...');
        const headers = ['Sr. No.', 'Name of Item', 'Supplier Name', 'Bid Amount', 'Status'];
        const headerRow = 3;
        
        headers.forEach((header, index) => {
            const cell = worksheet.getCell(headerRow, index + 1);
            cell.value = header;
            cell.font = { bold: true };
        });

        console.log('Adding sample data...');
        const sampleData = [
            [1, 'Medical Supplies', 'ABC Company', 'Rs. 50,000', 'Approved'],
            [2, 'Medical Supplies', 'XYZ Corporation', 'Rs. 55,000', 'Approved'],
            [3, 'Medical Supplies', 'DEF Suppliers', 'Rs. 45,000', 'Rejected - Did not meet specifications'],
            [4, 'Surgical Equipment', 'JKL Enterprises', 'Rs. 75,000', 'Approved'],
            [5, 'Surgical Equipment', 'MNO Industries', 'Rs. 80,000', 'Rejected - Price too high']
        ];

        sampleData.forEach((row, index) => {
            const rowNumber = headerRow + 1 + index;
            row.forEach((value, colIndex) => {
                worksheet.getCell(rowNumber, colIndex + 1).value = value;
            });
        });

        console.log('Preparing to save file...');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `Test_Technical_Evaluation_Report_${timestamp}.xlsx`;
        const filePath = path.join(__dirname, 'reports', fileName);

        console.log('Ensuring reports directory exists...');
        const reportsDir = path.join(__dirname, 'reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
            console.log('Reports directory created');
        }

        console.log('Saving Excel file...');
        await workbook.xlsx.writeFile(filePath);
        
        console.log(`✅ Excel file generated successfully: ${fileName}`);
        console.log(`📁 File location: ${filePath}`);
        
        // Verify file exists
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`📊 File size: ${stats.size} bytes`);
            console.log('🎉 Excel generation functionality is working correctly!');
        } else {
            console.log('❌ File was not created');
        }
        
        return fileName;

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

main();
