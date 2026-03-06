/**
 * Geographic Expansion Algorithm — Excel Workbook Generator
 *
 * Generates a multi-tab Excel workbook for planning geographic expansion
 * of Farmers Marketing + Food Truck'n platforms.
 *
 * Run: node docs/CC_reference_data/build-expansion-workbook.js
 */

const ExcelJS = require('exceljs');
const path = require('path');

async function buildWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = '815 Enterprises';
  wb.created = new Date();

  // Color constants
  const YELLOW = 'FFFFFF00';
  const LIGHT_YELLOW = 'FFFFFFCC';
  const LIGHT_GREEN = 'FFE8F5E9';
  const LIGHT_BLUE = 'FFE3F2FD';
  const LIGHT_GRAY = 'FFF5F5F5';
  const HEADER_GREEN = 'FF2D6A4F';
  const HEADER_RED = 'FFFF5757';
  const HEADER_DARK = 'FF1B4332';
  const WHITE = 'FFFFFFFF';
  const BORDER_GRAY = 'FFD0D0D0';

  const thinBorder = {
    top: { style: 'thin', color: { argb: BORDER_GRAY } },
    left: { style: 'thin', color: { argb: BORDER_GRAY } },
    bottom: { style: 'thin', color: { argb: BORDER_GRAY } },
    right: { style: 'thin', color: { argb: BORDER_GRAY } },
  };

  const headerFont = { bold: true, color: { argb: WHITE }, size: 11 };
  const headerFill = (color) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } });
  const inputFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
  const lightFill = (color) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } });

  // ═══════════════════════════════════════════════════════════════════
  // TAB 1: MARKET INPUT
  // ═══════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('Market Input', { properties: { tabColor: { argb: HEADER_GREEN } } });

  // Title
  ws1.mergeCells('A1:R1');
  const titleCell = ws1.getCell('A1');
  titleCell.value = 'GEOGRAPHIC EXPANSION — MARKET INPUT';
  titleCell.font = { bold: true, size: 14, color: { argb: HEADER_GREEN } };
  titleCell.alignment = { horizontal: 'center' };

  ws1.mergeCells('A2:R2');
  ws1.getCell('A2').value = 'Yellow cells = user input  |  Gray cells = dropdown selection  |  White cells = auto-calculated';
  ws1.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF666666' } };
  ws1.getCell('A2').alignment = { horizontal: 'center' };

  // Headers
  const headers1 = [
    'Market ID', 'Region', 'State', 'City/County Name', 'Population',
    'Median HH Income', 'Community Type', 'Economy Type', 'City Size',
    'Existing FM Count', 'Existing FT Count', 'Farm Count (County)',
    'Growing Season (Days)', 'University Enrollment', 'Competition Level',
    'Local Champion', 'FT Regulatory Climate', 'Tourism Level'
  ];

  const inputCols1 = [4, 5, 6, 10, 11, 12, 13, 14]; // D, E, F, J, K, L, M, N (1-indexed)
  const dropdownCols1 = [2, 3, 7, 8, 15, 16, 17, 18]; // B, C, G, H, O, P, Q, R
  const autoCols1 = [1, 9]; // A, I

  ws1.getRow(4).height = 30;
  headers1.forEach((h, i) => {
    const cell = ws1.getCell(4, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill(HEADER_GREEN);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  // Column widths
  const widths1 = [10, 16, 14, 22, 14, 16, 16, 16, 14, 14, 14, 16, 18, 18, 16, 16, 20, 14];
  widths1.forEach((w, i) => { ws1.getColumn(i + 1).width = w; });

  // Data rows (20 empty rows for input)
  for (let row = 5; row <= 24; row++) {
    // Market ID (auto)
    const idCell = ws1.getCell(row, 1);
    idCell.value = `M-${String(row - 4).padStart(3, '0')}`;
    idCell.fill = lightFill(LIGHT_GRAY);
    idCell.border = thinBorder;
    idCell.alignment = { horizontal: 'center' };

    for (let col = 2; col <= 18; col++) {
      const cell = ws1.getCell(row, col);
      cell.border = thinBorder;

      if (inputCols1.includes(col)) {
        cell.fill = inputFill;
      } else if (dropdownCols1.includes(col)) {
        cell.fill = lightFill(LIGHT_GRAY);
      }

      // Number formats
      if (col === 5) cell.numFmt = '#,##0';      // Population
      if (col === 6) cell.numFmt = '$#,##0';      // Income
      if (col === 14) cell.numFmt = '#,##0';      // Enrollment
    }

    // City Size auto-calc (column I = 9)
    const sizeCell = ws1.getCell(row, 9);
    sizeCell.value = {
      formula: `IF(E${row}="","",IF(E${row}<25000,"Micro",IF(E${row}<100000,"Small",IF(E${row}<250000,"Medium",IF(E${row}<1000000,"Large","Metro")))))`
    };
    sizeCell.fill = lightFill(LIGHT_GRAY);
    sizeCell.alignment = { horizontal: 'center' };
  }

  // Dropdowns
  const dropdowns1 = {
    2: ['"New England,Mid-Atlantic,South-East,South-West,Rocky Mountain,Pacific Coast,Midwest"'],
    3: ['"AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY"'],
    7: ['"Rural,Suburban,Urban,College Town"'],
    8: ['"Agricultural,Industrial,Technical,Service,Tourism,Mixed"'],
    15: ['"None,Weak,Moderate,Strong"'],
    16: ['"None,Contact Only,Active Advocate,Partner"'],
    17: ['"Very Friendly,Friendly,Moderate,Restrictive,Very Restrictive"'],
    18: ['"None,Low,Moderate,High,Destination"'],
  };

  for (const [col, formulae] of Object.entries(dropdowns1)) {
    for (let row = 5; row <= 24; row++) {
      ws1.getCell(row, parseInt(col)).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: formulae,
        showErrorMessage: true,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB 2: SCORING ENGINE
  // ═══════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Scoring Engine', { properties: { tabColor: { argb: 'FF1565C0' } } });

  ws2.mergeCells('A1:P1');
  ws2.getCell('A1').value = 'MARKET SCORING ENGINE — All values auto-calculated from Market Input tab';
  ws2.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1565C0' } };
  ws2.getCell('A1').alignment = { horizontal: 'center' };

  ws2.mergeCells('A2:P2');
  ws2.getCell('A2').value = 'Scores range 0-100. Higher = more attractive market. FM and FT scored independently.';
  ws2.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF666666' } };
  ws2.getCell('A2').alignment = { horizontal: 'center' };

  // FM Scoring headers
  const fmHeaders = [
    'Market ID', 'City/County', 'Pop Score', 'Income Score', 'FM Density Score',
    'Farm Density Score', 'Season Score', 'Community Fit', 'Economy Score',
    'Tourism Score', 'Competition', 'Champion Bonus', 'FM TOTAL SCORE', 'FM Grade'
  ];

  ws2.getRow(4).height = 30;
  fmHeaders.forEach((h, i) => {
    const cell = ws2.getCell(4, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill(HEADER_GREEN);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  const widths2 = [10, 20, 10, 12, 14, 14, 12, 14, 12, 12, 12, 14, 14, 10];
  widths2.forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

  // FM Score formulas for each row
  for (let row = 5; row <= 24; row++) {
    const r = row; // row in this sheet
    const ir = row; // corresponding row in Market Input

    // Market ID
    ws2.getCell(r, 1).value = { formula: `'Market Input'!A${ir}` };
    ws2.getCell(r, 1).border = thinBorder;

    // City/County
    ws2.getCell(r, 2).value = { formula: `'Market Input'!D${ir}` };
    ws2.getCell(r, 2).border = thinBorder;

    // Population Score (15%) — peaks at Large cities
    ws2.getCell(r, 3).value = {
      formula: `IF('Market Input'!E${ir}="",0,IF('Market Input'!E${ir}<25000,5,IF('Market Input'!E${ir}<100000,15,IF('Market Input'!E${ir}<250000,30,IF('Market Input'!E${ir}<1000000,50,40)))))`
    };
    ws2.getCell(r, 3).border = thinBorder;

    // Income Score (15%)
    ws2.getCell(r, 4).value = {
      formula: `IF('Market Input'!F${ir}="",0,IF('Market Input'!F${ir}<40000,5,IF('Market Input'!F${ir}<60000,20,IF('Market Input'!F${ir}<80000,40,IF('Market Input'!F${ir}<100000,60,50)))))`
    };
    ws2.getCell(r, 4).border = thinBorder;

    // FM Density Score (15%) — FM count per 100K pop
    ws2.getCell(r, 5).value = {
      formula: `IF(OR('Market Input'!J${ir}="",'Market Input'!E${ir}="",'Market Input'!E${ir}=0),0,LET(density,'Market Input'!J${ir}/'Market Input'!E${ir}*100000,IF(density<2,10,IF(density<5,30,IF(density<8,40,20)))))`
    };
    ws2.getCell(r, 5).border = thinBorder;

    // Farm Density Score (15%)
    ws2.getCell(r, 6).value = {
      formula: `IF('Market Input'!L${ir}="",0,IF('Market Input'!L${ir}<100,5,IF('Market Input'!L${ir}<500,20,IF('Market Input'!L${ir}<1000,35,40))))`
    };
    ws2.getCell(r, 6).border = thinBorder;

    // Season Score (10%)
    ws2.getCell(r, 7).value = {
      formula: `IF('Market Input'!M${ir}="",0,IF('Market Input'!M${ir}<120,10,IF('Market Input'!M${ir}<180,25,IF('Market Input'!M${ir}<240,35,40))))`
    };
    ws2.getCell(r, 7).border = thinBorder;

    // Community Fit (10%)
    ws2.getCell(r, 8).value = {
      formula: `IF('Market Input'!G${ir}="",0,IF('Market Input'!G${ir}="Rural",35,IF('Market Input'!G${ir}="Suburban",35,IF('Market Input'!G${ir}="Urban",25,30))))`
    };
    ws2.getCell(r, 8).border = thinBorder;

    // Economy Score (5%)
    ws2.getCell(r, 9).value = {
      formula: `IF('Market Input'!H${ir}="",0,IF('Market Input'!H${ir}="Agricultural",40,IF('Market Input'!H${ir}="Mixed",30,IF('Market Input'!H${ir}="Tourism",30,IF('Market Input'!H${ir}="Service",25,IF('Market Input'!H${ir}="Technical",20,15))))))`
    };
    ws2.getCell(r, 9).border = thinBorder;

    // Tourism Score (5%)
    ws2.getCell(r, 10).value = {
      formula: `IF('Market Input'!R${ir}="",0,IF('Market Input'!R${ir}="None",0,IF('Market Input'!R${ir}="Low",10,IF('Market Input'!R${ir}="Moderate",25,IF('Market Input'!R${ir}="High",35,40)))))`
    };
    ws2.getCell(r, 10).border = thinBorder;

    // Competition (5%) — inverted: less competition = higher score
    ws2.getCell(r, 11).value = {
      formula: `IF('Market Input'!O${ir}="",0,IF('Market Input'!O${ir}="None",40,IF('Market Input'!O${ir}="Weak",30,IF('Market Input'!O${ir}="Moderate",15,5))))`
    };
    ws2.getCell(r, 11).border = thinBorder;

    // Champion Bonus (5%)
    ws2.getCell(r, 12).value = {
      formula: `IF('Market Input'!P${ir}="",0,IF('Market Input'!P${ir}="None",5,IF('Market Input'!P${ir}="Contact Only",15,IF('Market Input'!P${ir}="Active Advocate",30,40))))`
    };
    ws2.getCell(r, 12).border = thinBorder;

    // FM TOTAL SCORE — weighted sum normalized to 0-100
    // Weights: Pop 15%, Income 15%, FM Density 15%, Farm 15%, Season 10%, Community 10%, Economy 5%, Tourism 5%, Competition 5%, Champion 5%
    ws2.getCell(r, 13).value = {
      formula: `IF('Market Input'!D${ir}="","",ROUND((C${r}*0.15+D${r}*0.15+E${r}*0.15+F${r}*0.15+G${r}*0.10+H${r}*0.10+I${r}*0.05+J${r}*0.05+K${r}*0.05+L${r}*0.05)/40*100,0))`
    };
    ws2.getCell(r, 13).border = thinBorder;
    ws2.getCell(r, 13).font = { bold: true, size: 12 };
    ws2.getCell(r, 13).fill = lightFill(LIGHT_GREEN);

    // FM Grade
    ws2.getCell(r, 14).value = {
      formula: `IF(M${r}="","",IF(M${r}>=80,"A",IF(M${r}>=65,"B",IF(M${r}>=50,"C",IF(M${r}>=35,"D","F")))))`
    };
    ws2.getCell(r, 14).border = thinBorder;
    ws2.getCell(r, 14).font = { bold: true };
    ws2.getCell(r, 14).alignment = { horizontal: 'center' };
  }

  // FT Scoring section — Row 27+
  ws2.mergeCells('A27:N27');
  ws2.getCell('A27').value = 'FOOD TRUCK SCORING';
  ws2.getCell('A27').font = { bold: true, size: 14, color: { argb: HEADER_RED } };
  ws2.getCell('A27').alignment = { horizontal: 'center' };

  const ftHeaders = [
    'Market ID', 'City/County', 'Pop Score', 'Income Score', 'FT Density Score',
    'University Score', 'Regulatory Score', 'Tourism Score', 'Community Fit',
    'Competition', 'Champion Bonus', 'Climate Score', 'FT TOTAL SCORE', 'FT Grade'
  ];

  ws2.getRow(29).height = 30;
  ftHeaders.forEach((h, i) => {
    const cell = ws2.getCell(29, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill(HEADER_RED);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  for (let row = 30; row <= 49; row++) {
    const ir = row - 25; // Corresponding Market Input row (5-24)
    const r = row;

    ws2.getCell(r, 1).value = { formula: `'Market Input'!A${ir}` };
    ws2.getCell(r, 1).border = thinBorder;

    ws2.getCell(r, 2).value = { formula: `'Market Input'!D${ir}` };
    ws2.getCell(r, 2).border = thinBorder;

    // FT Pop Score (20%) — scales linearly with density, Metro is best
    ws2.getCell(r, 3).value = {
      formula: `IF('Market Input'!E${ir}="",0,IF('Market Input'!E${ir}<25000,5,IF('Market Input'!E${ir}<100000,10,IF('Market Input'!E${ir}<250000,25,IF('Market Input'!E${ir}<1000000,45,50)))))`
    };
    ws2.getCell(r, 3).border = thinBorder;

    // FT Income Score (10%)
    ws2.getCell(r, 4).value = {
      formula: `IF('Market Input'!F${ir}="",0,IF('Market Input'!F${ir}<40000,15,IF('Market Input'!F${ir}<60000,25,IF('Market Input'!F${ir}<80000,35,40))))`
    };
    ws2.getCell(r, 4).border = thinBorder;

    // FT Density Score (10%)
    ws2.getCell(r, 5).value = {
      formula: `IF(OR('Market Input'!K${ir}="",'Market Input'!E${ir}="",'Market Input'!E${ir}=0),0,LET(density,'Market Input'!K${ir}/'Market Input'!E${ir}*100000,IF(density<1,10,IF(density<5,25,IF(density<15,40,30)))))`
    };
    ws2.getCell(r, 5).border = thinBorder;

    // University Score (15%)
    ws2.getCell(r, 6).value = {
      formula: `IF('Market Input'!N${ir}="",0,IF('Market Input'!N${ir}=0,0,IF('Market Input'!N${ir}<5000,10,IF('Market Input'!N${ir}<15000,25,IF('Market Input'!N${ir}<30000,35,40)))))`
    };
    ws2.getCell(r, 6).border = thinBorder;

    // Regulatory Score (10%)
    ws2.getCell(r, 7).value = {
      formula: `IF('Market Input'!Q${ir}="",0,IF('Market Input'!Q${ir}="Very Friendly",40,IF('Market Input'!Q${ir}="Friendly",30,IF('Market Input'!Q${ir}="Moderate",20,IF('Market Input'!Q${ir}="Restrictive",10,0)))))`
    };
    ws2.getCell(r, 7).border = thinBorder;

    // Tourism (10%)
    ws2.getCell(r, 8).value = {
      formula: `IF('Market Input'!R${ir}="",0,IF('Market Input'!R${ir}="None",0,IF('Market Input'!R${ir}="Low",10,IF('Market Input'!R${ir}="Moderate",25,IF('Market Input'!R${ir}="High",35,40)))))`
    };
    ws2.getCell(r, 8).border = thinBorder;

    // Community Fit (10%) — Urban and College Town score highest for FT
    ws2.getCell(r, 9).value = {
      formula: `IF('Market Input'!G${ir}="",0,IF('Market Input'!G${ir}="Urban",40,IF('Market Input'!G${ir}="College Town",38,IF('Market Input'!G${ir}="Suburban",25,10))))`
    };
    ws2.getCell(r, 9).border = thinBorder;

    // Competition (5%)
    ws2.getCell(r, 10).value = {
      formula: `IF('Market Input'!O${ir}="",0,IF('Market Input'!O${ir}="None",40,IF('Market Input'!O${ir}="Weak",30,IF('Market Input'!O${ir}="Moderate",15,5))))`
    };
    ws2.getCell(r, 10).border = thinBorder;

    // Champion (5%)
    ws2.getCell(r, 11).value = {
      formula: `IF('Market Input'!P${ir}="",0,IF('Market Input'!P${ir}="None",5,IF('Market Input'!P${ir}="Contact Only",15,IF('Market Input'!P${ir}="Active Advocate",30,40))))`
    };
    ws2.getCell(r, 11).border = thinBorder;

    // Climate/Season (5%)
    ws2.getCell(r, 12).value = {
      formula: `IF('Market Input'!M${ir}="",0,IF('Market Input'!M${ir}<120,10,IF('Market Input'!M${ir}<180,20,IF('Market Input'!M${ir}<240,30,40))))`
    };
    ws2.getCell(r, 12).border = thinBorder;

    // FT TOTAL SCORE
    // Weights: Pop 20%, Income 10%, FT Density 10%, University 15%, Regulatory 10%, Tourism 10%, Community 10%, Competition 5%, Champion 5%, Climate 5%
    ws2.getCell(r, 13).value = {
      formula: `IF('Market Input'!D${ir}="","",ROUND((C${r}*0.20+D${r}*0.10+E${r}*0.10+F${r}*0.15+G${r}*0.10+H${r}*0.10+I${r}*0.10+J${r}*0.05+K${r}*0.05+L${r}*0.05)/40*100,0))`
    };
    ws2.getCell(r, 13).border = thinBorder;
    ws2.getCell(r, 13).font = { bold: true, size: 12 };
    ws2.getCell(r, 13).fill = lightFill(LIGHT_BLUE);

    // FT Grade
    ws2.getCell(r, 14).value = {
      formula: `IF(M${r}="","",IF(M${r}>=80,"A",IF(M${r}>=65,"B",IF(M${r}>=50,"C",IF(M${r}>=35,"D","F")))))`
    };
    ws2.getCell(r, 14).border = thinBorder;
    ws2.getCell(r, 14).font = { bold: true };
    ws2.getCell(r, 14).alignment = { horizontal: 'center' };
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB 3: VENDOR & REVENUE PROJECTIONS
  // ═══════════════════════════════════════════════════════════════════
  const ws3 = wb.addWorksheet('Revenue Projections', { properties: { tabColor: { argb: 'FF2E7D32' } } });

  ws3.mergeCells('A1:L1');
  ws3.getCell('A1').value = 'VENDOR COUNT & REVENUE PROJECTIONS';
  ws3.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF2E7D32' } };
  ws3.getCell('A1').alignment = { horizontal: 'center' };

  // Assumptions section
  ws3.getCell('A3').value = 'ADJUSTABLE ASSUMPTIONS';
  ws3.getCell('A3').font = { bold: true, size: 12, color: { argb: HEADER_GREEN } };

  const assumptions = [
    ['', 'Assumption', 'FM Value', 'FT Value', 'Source / Notes'],
    ['1', 'Platform Adoption Rate (Year 1)', '5%', '3%', 'Conservative — scales to 15-25% by Year 3'],
    ['2', 'Avg Transaction $ (High Vol)', '$35.00', '$14.00', 'Penn State Extension 2024 / FoodTruckProfit 2026'],
    ['3', 'Avg Transaction $ (Mod Vol)', '$30.00', '$13.00', 'Adjusted by volume tier'],
    ['4', 'Avg Transaction $ (Low Vol)', '$25.00', '$11.00', 'Adjusted by volume tier'],
    ['5', 'Transactions/Week (High Vol)', '25', '40', 'Platform transactions, not total vendor sales'],
    ['6', 'Transactions/Week (Mod Vol)', '12', '20', ''],
    ['7', 'Transactions/Week (Low Vol)', '5', '8', ''],
    ['8', 'Vendor Tier Split: High %', '15%', '20%', ''],
    ['9', 'Vendor Tier Split: Moderate %', '50%', '45%', ''],
    ['10', 'Vendor Tier Split: Low %', '35%', '35%', ''],
    ['11', 'Platform Fee (Buyer)', '6.5%', '6.5%', 'From pricing.ts'],
    ['11b', 'Platform Fee (Vendor - Stripe)', '6.5%', '6.5%', 'From pricing.ts — charged on platform transactions'],
    ['11c', 'Platform Fee (Vendor - External)', '3.5%', '3.5%', 'From pricing.ts — charged on cash/Venmo/etc'],
    ['11d', 'Est. % Platform vs External', '70%', '85%', 'Estimated split — platform transactions tend higher for FT'],
    ['12', 'FM Direct-to-Consumer Farm %', '15%', 'N/A', 'USDA Census benchmark'],
    ['13', 'FT per capita ratio', 'N/A', '1 per 5,000', 'National avg for estimating FT count'],
    ['14', 'Subscription: Free tier %', '40%', '40%', 'Year 1 tier distribution'],
    ['15', 'Subscription: Basic/Standard %', '35%', '35%', ''],
    ['16', 'Subscription: Premium/Pro %', '20%', '20%', ''],
    ['17', 'Subscription: Featured/Boss %', '5%', '5%', ''],
    ['18', 'Sub Price: Free', '$0', '$0', ''],
    ['19', 'Sub Price: Basic/Standard', '$10', '$10', ''],
    ['20', 'Sub Price: Premium/Pro', '$25', '$25', ''],
    ['21', 'Sub Price: Featured/Boss', '$50', '$50', ''],
  ];

  const assumpHeaders = assumptions[0];
  ws3.getRow(4).height = 25;
  assumpHeaders.forEach((h, i) => {
    const cell = ws3.getCell(4, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill(HEADER_GREEN);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  [5, 16, 20, 16, 40].forEach((w, i) => { ws3.getColumn(i + 1).width = Math.max(ws3.getColumn(i + 1).width || 0, w); });

  assumptions.slice(1).forEach((row, i) => {
    row.forEach((val, j) => {
      const cell = ws3.getCell(5 + i, j + 1);
      cell.value = val;
      cell.border = thinBorder;
      if (j === 2 || j === 3) {
        cell.fill = inputFill;
        cell.alignment = { horizontal: 'center' };
      }
    });
  });

  // Projection table
  const projRow = 28;
  ws3.getCell(`A${projRow}`).value = 'MARKET PROJECTIONS (Year 1)';
  ws3.getCell(`A${projRow}`).font = { bold: true, size: 12, color: { argb: HEADER_GREEN } };

  const projHeaders = [
    'Market ID', 'City/County', 'FM Score', 'FT Score',
    'Est. FM Vendors', 'Est. FT Vendors', 'Total Vendors',
    'FM Monthly Rev', 'FT Monthly Rev', 'Sub Monthly Rev',
    'Total Monthly Rev', 'Annual Revenue'
  ];

  ws3.getRow(projRow + 1).height = 30;
  projHeaders.forEach((h, i) => {
    const cell = ws3.getCell(projRow + 1, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill(HEADER_GREEN);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  [10, 20, 10, 10, 14, 14, 12, 14, 14, 14, 16, 14].forEach((w, i) => {
    ws3.getColumn(i + 1).width = Math.max(ws3.getColumn(i + 1).width || 0, w);
  });

  for (let row = projRow + 2; row <= projRow + 21; row++) {
    const ir = row - projRow + 3; // Market Input row
    const sr = row - projRow + 3; // Scoring Engine row (FM section)
    const ftsr = sr + 25; // Scoring Engine row (FT section)

    // Market ID
    ws3.getCell(row, 1).value = { formula: `'Market Input'!A${ir}` };
    ws3.getCell(row, 1).border = thinBorder;

    // City/County
    ws3.getCell(row, 2).value = { formula: `'Market Input'!D${ir}` };
    ws3.getCell(row, 2).border = thinBorder;

    // FM Score
    ws3.getCell(row, 3).value = { formula: `'Scoring Engine'!M${sr}` };
    ws3.getCell(row, 3).border = thinBorder;
    ws3.getCell(row, 3).fill = lightFill(LIGHT_GREEN);

    // FT Score
    ws3.getCell(row, 4).value = { formula: `'Scoring Engine'!M${ftsr}` };
    ws3.getCell(row, 4).border = thinBorder;
    ws3.getCell(row, 4).fill = lightFill(LIGHT_BLUE);

    // Est FM Vendors = Farm_Count × 0.15 × adoption_rate × (score/50)
    // Using MAX(5, ...) as minimum viable vendor count
    ws3.getCell(row, 5).value = {
      formula: `IF('Market Input'!D${ir}="","",MAX(0,ROUND(IF('Market Input'!L${ir}="",'Market Input'!E${ir}/20000,'Market Input'!L${ir}*0.15)*0.05*MAX(0.5,C${row}/50),0)))`
    };
    ws3.getCell(row, 5).border = thinBorder;

    // Est FT Vendors = (FT_count or Pop/5000) × adoption_rate × (score/50)
    ws3.getCell(row, 6).value = {
      formula: `IF('Market Input'!D${ir}="","",MAX(0,ROUND(IF('Market Input'!K${ir}="",'Market Input'!E${ir}/5000,'Market Input'!K${ir})*0.03*MAX(0.5,D${row}/50),0)))`
    };
    ws3.getCell(row, 6).border = thinBorder;

    // Total Vendors
    ws3.getCell(row, 7).value = { formula: `IF(E${row}="","",E${row}+F${row})` };
    ws3.getCell(row, 7).border = thinBorder;
    ws3.getCell(row, 7).font = { bold: true };

    // FM Monthly Transaction Revenue
    // = FM_vendors × weighted avg weekly GMV × blended platform take × 4.33 weeks/mo
    // Weighted avg weekly GMV: (0.15×25×35 + 0.50×12×30 + 0.35×5×25) = 355 per vendor/week
    // Blended take: FM est 70% platform (13%) + 30% external (10%) = 12.1%
    // Using 0.121 as FM blended rate
    ws3.getCell(row, 8).value = {
      formula: `IF(E${row}="","",ROUND(E${row}*(0.15*25*35+0.50*12*30+0.35*5*25)*(0.70*0.13+0.30*0.10)*4.33,2))`
    };
    ws3.getCell(row, 8).border = thinBorder;
    ws3.getCell(row, 8).numFmt = '$#,##0.00';

    // FT Monthly Transaction Revenue
    // Weighted avg weekly GMV: (0.20×40×14 + 0.45×20×13 + 0.35×8×11) = 259.80
    // Blended take: FT est 85% platform (13%) + 15% external (10%) = 12.55%
    // Using 0.1255 as FT blended rate
    ws3.getCell(row, 9).value = {
      formula: `IF(F${row}="","",ROUND(F${row}*(0.20*40*14+0.45*20*13+0.35*8*11)*(0.85*0.13+0.15*0.10)*4.33,2))`
    };
    ws3.getCell(row, 9).border = thinBorder;
    ws3.getCell(row, 9).numFmt = '$#,##0.00';

    // Subscription Monthly Revenue
    // = total_vendors × (0.40×0 + 0.35×10 + 0.20×25 + 0.05×50) = × $11.00 avg
    ws3.getCell(row, 10).value = {
      formula: `IF(G${row}="","",ROUND(G${row}*(0.40*0+0.35*10+0.20*25+0.05*50),2))`
    };
    ws3.getCell(row, 10).border = thinBorder;
    ws3.getCell(row, 10).numFmt = '$#,##0.00';

    // Total Monthly Revenue
    ws3.getCell(row, 11).value = {
      formula: `IF(G${row}="","",H${row}+I${row}+J${row})`
    };
    ws3.getCell(row, 11).border = thinBorder;
    ws3.getCell(row, 11).numFmt = '$#,##0.00';
    ws3.getCell(row, 11).font = { bold: true };
    ws3.getCell(row, 11).fill = lightFill(LIGHT_GREEN);

    // Annual Revenue (monthly × 12, adjusted for FM seasonality ~0.65 avg factor)
    ws3.getCell(row, 12).value = {
      formula: `IF(G${row}="","",(H${row}*0.65+I${row}*0.85+J${row})*12)`
    };
    ws3.getCell(row, 12).border = thinBorder;
    ws3.getCell(row, 12).numFmt = '$#,##0';
    ws3.getCell(row, 12).font = { bold: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB 4: COST & ROI
  // ═══════════════════════════════════════════════════════════════════
  const ws4 = wb.addWorksheet('Cost & ROI', { properties: { tabColor: { argb: 'FFE65100' } } });

  ws4.mergeCells('A1:H1');
  ws4.getCell('A1').value = 'COST & ROI ANALYSIS';
  ws4.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFE65100' } };
  ws4.getCell('A1').alignment = { horizontal: 'center' };

  // Cost inputs
  ws4.getCell('A3').value = 'SALES REP COSTS';
  ws4.getCell('A3').font = { bold: true, size: 12, color: { argb: 'FFE65100' } };

  const costInputs = [
    ['', 'Field', 'Value', 'Notes'],
    ['1', 'Weekly Base Pay', '', 'Small fixed weekly amount per rep'],
    ['2', 'Bonus per Vendor Signed ($)', '', 'One-time commission per new vendor onboarded'],
    ['3', 'Revenue Share % (of market rev)', '', 'Ongoing % of platform revenue from their market (e.g. 10%)'],
    ['4', 'Target Vendors per Month', '', 'How many vendors should they sign monthly'],
    ['5', 'Monthly Marketing Budget', '', 'Per-market ad spend, flyers, events'],
    ['6', 'Monthly Travel/Expense', '', 'Gas, meals, supplies'],
  ];

  ws4.getRow(4).height = 25;
  costInputs[0].forEach((h, i) => {
    const cell = ws4.getCell(4, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill('FFE65100');
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center' };
  });

  [5, 30, 14, 45].forEach((w, i) => { ws4.getColumn(i + 1).width = w; });

  costInputs.slice(1).forEach((row, i) => {
    row.forEach((val, j) => {
      const cell = ws4.getCell(5 + i, j + 1);
      cell.value = val;
      cell.border = thinBorder;
      if (j === 2) {
        cell.fill = inputFill;
        // Revenue Share % (i=2) and Target Vendors (i=3) are not currency
        if (i === 2) cell.numFmt = '0.0"%"';
        else if (i === 3) cell.numFmt = '0';
        else cell.numFmt = '$#,##0.00';
      }
    });
  });

  // Calculated costs
  ws4.getCell('A13').value = 'CALCULATED COSTS';
  ws4.getCell('A13').font = { bold: true, size: 12, color: { argb: 'FFE65100' } };

  const calcCosts = [
    ['Monthly Base Pay', { formula: 'C5*4.33' }, '= Weekly Base × 4.33 weeks/month'],
    ['Monthly Signup Bonuses', { formula: 'C6*C8' }, '= Bonus per vendor × vendors signed/month'],
    ['Monthly Rev Share (see ROI table)', '', 'Calculated per-market below (varies by market revenue)'],
    ['Monthly Fixed Cost (per market)', { formula: 'C14+C15+C9+C10' }, '= Base + Bonuses + Marketing + Travel'],
  ];

  calcCosts.forEach((row, i) => {
    ws4.getCell(14 + i, 2).value = row[0];
    ws4.getCell(14 + i, 2).font = { bold: true };
    ws4.getCell(14 + i, 2).border = thinBorder;
    ws4.getCell(14 + i, 3).value = row[1];
    ws4.getCell(14 + i, 3).numFmt = '$#,##0.00';
    ws4.getCell(14 + i, 3).border = thinBorder;
    ws4.getCell(14 + i, 3).fill = lightFill(LIGHT_GREEN);
    ws4.getCell(14 + i, 4).value = row[2];
    ws4.getCell(14 + i, 4).font = { italic: true, color: { argb: 'FF666666' } };
    ws4.getCell(14 + i, 4).border = thinBorder;
  });

  // ROI per market
  const roiRow = 19;
  ws4.getCell(`A${roiRow}`).value = 'ROI BY MARKET';
  ws4.getCell(`A${roiRow}`).font = { bold: true, size: 12, color: { argb: 'FFE65100' } };

  const roiHeaders = [
    'Market ID', 'City/County', 'Monthly Revenue', 'Monthly Cost',
    'Monthly Net', 'Break-even Month', '12-Month ROI', 'Verdict'
  ];

  ws4.getRow(roiRow + 1).height = 25;
  roiHeaders.forEach((h, i) => {
    const cell = ws4.getCell(roiRow + 1, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill('FFE65100');
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  ws4.getColumn(5).width = 14;
  ws4.getColumn(6).width = 16;
  ws4.getColumn(7).width = 14;
  ws4.getColumn(8).width = 12;

  for (let row = roiRow + 2; row <= roiRow + 21; row++) {
    const rr = row - roiRow + 28; // Revenue Projections row
    const ir = row - roiRow + 3;  // Market Input row

    ws4.getCell(row, 1).value = { formula: `'Market Input'!A${ir}` };
    ws4.getCell(row, 1).border = thinBorder;

    ws4.getCell(row, 2).value = { formula: `'Market Input'!D${ir}` };
    ws4.getCell(row, 2).border = thinBorder;

    // Monthly Revenue from Revenue Projections tab
    ws4.getCell(row, 3).value = { formula: `'Revenue Projections'!K${rr}` };
    ws4.getCell(row, 3).border = thinBorder;
    ws4.getCell(row, 3).numFmt = '$#,##0';

    // Monthly Cost = Fixed Cost + Revenue Share (fixed cost + market revenue × rev share %)
    // C$17 = Monthly Fixed Cost, C${row} = this market's monthly revenue, C$7 = Revenue Share %
    ws4.getCell(row, 4).value = { formula: `IF('Market Input'!D${ir}="","",C$17+C${row}*C$7/100)` };
    ws4.getCell(row, 4).border = thinBorder;
    ws4.getCell(row, 4).numFmt = '$#,##0';

    // Monthly Net
    ws4.getCell(row, 5).value = { formula: `IF(C${row}="","",C${row}-D${row})` };
    ws4.getCell(row, 5).border = thinBorder;
    ws4.getCell(row, 5).numFmt = '$#,##0';

    // Break-even: profitable if monthly net > 0
    ws4.getCell(row, 6).value = {
      formula: `IF(C${row}="","",IF(E${row}>0,"Profitable",IF(E${row}>-200,"Near Break-Even","Not Profitable")))`
    };
    ws4.getCell(row, 6).border = thinBorder;
    ws4.getCell(row, 6).alignment = { horizontal: 'center' };

    // 12-Month ROI
    ws4.getCell(row, 7).value = {
      formula: `IF(OR(C${row}="",D${row}="",D${row}=0),"",ROUND((C${row}*12-D${row}*12)/(D${row}*12)*100,0)&"%")`
    };
    ws4.getCell(row, 7).border = thinBorder;
    ws4.getCell(row, 7).alignment = { horizontal: 'center' };

    // Verdict
    ws4.getCell(row, 8).value = {
      formula: `IF(C${row}="","",IF(C${row}>=D${row},"PROFITABLE",IF(C${row}>=D${row}*0.5,"INVEST","WAIT")))`
    };
    ws4.getCell(row, 8).border = thinBorder;
    ws4.getCell(row, 8).alignment = { horizontal: 'center' };
    ws4.getCell(row, 8).font = { bold: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB 5: PRIORITY DASHBOARD
  // ═══════════════════════════════════════════════════════════════════
  const ws5 = wb.addWorksheet('Priority Dashboard', { properties: { tabColor: { argb: 'FF6A1B9A' } } });

  ws5.mergeCells('A1:K1');
  ws5.getCell('A1').value = 'MARKET PRIORITY DASHBOARD';
  ws5.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF6A1B9A' } };
  ws5.getCell('A1').alignment = { horizontal: 'center' };

  ws5.mergeCells('A2:K2');
  ws5.getCell('A2').value = 'Combined view — sort by Combined Score or Annual Revenue to prioritize markets';
  ws5.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF666666' } };
  ws5.getCell('A2').alignment = { horizontal: 'center' };

  const dashHeaders = [
    'Market ID', 'City/County', 'Region', 'Population',
    'FM Score', 'FT Score', 'Combined Score',
    'Est. Vendors', 'Annual Revenue', '12-Mo ROI', 'GO / NO-GO'
  ];

  ws5.getRow(4).height = 30;
  dashHeaders.forEach((h, i) => {
    const cell = ws5.getCell(4, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill('FF6A1B9A');
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  [10, 22, 16, 14, 10, 10, 14, 12, 14, 12, 12].forEach((w, i) => { ws5.getColumn(i + 1).width = w; });

  for (let row = 5; row <= 24; row++) {
    const ir = row;
    const rr = row + 25; // Revenue Projections row
    const cr = row + 16; // Cost & ROI row

    ws5.getCell(row, 1).value = { formula: `'Market Input'!A${ir}` };
    ws5.getCell(row, 1).border = thinBorder;

    ws5.getCell(row, 2).value = { formula: `'Market Input'!D${ir}` };
    ws5.getCell(row, 2).border = thinBorder;

    ws5.getCell(row, 3).value = { formula: `'Market Input'!B${ir}` };
    ws5.getCell(row, 3).border = thinBorder;

    ws5.getCell(row, 4).value = { formula: `'Market Input'!E${ir}` };
    ws5.getCell(row, 4).border = thinBorder;
    ws5.getCell(row, 4).numFmt = '#,##0';

    ws5.getCell(row, 5).value = { formula: `'Scoring Engine'!M${ir}` };
    ws5.getCell(row, 5).border = thinBorder;
    ws5.getCell(row, 5).fill = lightFill(LIGHT_GREEN);

    ws5.getCell(row, 6).value = { formula: `'Scoring Engine'!M${ir + 25}` };
    ws5.getCell(row, 6).border = thinBorder;
    ws5.getCell(row, 6).fill = lightFill(LIGHT_BLUE);

    // Combined Score (adjustable weight — default 50/50)
    ws5.getCell(row, 7).value = {
      formula: `IF(OR(E${row}="",F${row}=""),"",ROUND(E${row}*0.5+F${row}*0.5,0))`
    };
    ws5.getCell(row, 7).border = thinBorder;
    ws5.getCell(row, 7).font = { bold: true, size: 12 };

    ws5.getCell(row, 8).value = { formula: `'Revenue Projections'!G${rr}` };
    ws5.getCell(row, 8).border = thinBorder;

    ws5.getCell(row, 9).value = { formula: `'Revenue Projections'!L${rr}` };
    ws5.getCell(row, 9).border = thinBorder;
    ws5.getCell(row, 9).numFmt = '$#,##0';

    ws5.getCell(row, 10).value = { formula: `'Cost & ROI'!G${cr}` };
    ws5.getCell(row, 10).border = thinBorder;
    ws5.getCell(row, 10).alignment = { horizontal: 'center' };

    // GO / NO-GO
    ws5.getCell(row, 11).value = {
      formula: `IF(G${row}="","",IF(G${row}>=60,"GO",IF(G${row}>=40,"MAYBE","NO")))`
    };
    ws5.getCell(row, 11).border = thinBorder;
    ws5.getCell(row, 11).font = { bold: true, size: 12 };
    ws5.getCell(row, 11).alignment = { horizontal: 'center' };
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB 6: REFERENCE DATA
  // ═══════════════════════════════════════════════════════════════════
  const ws6 = wb.addWorksheet('Reference Data', { properties: { tabColor: { argb: 'FF546E7A' } } });

  ws6.mergeCells('A1:F1');
  ws6.getCell('A1').value = 'REFERENCE DATA & SOURCES';
  ws6.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF546E7A' } };
  ws6.getCell('A1').alignment = { horizontal: 'center' };

  // Benchmark data
  ws6.getCell('A3').value = 'TRANSACTION BENCHMARKS';
  ws6.getCell('A3').font = { bold: true, size: 12 };

  const benchmarks = [
    ['Metric', 'FM Value', 'FT Value', 'Source'],
    ['Avg customer spend per visit', '$31-35', '$12.76', 'Penn State Extension 2024 / FoodTruckProfit 2026'],
    ['Spend distribution: $10-25', '32%', '', 'Penn State Extension Survey'],
    ['Spend distribution: $26-50', '38%', '', 'Penn State Extension Survey'],
    ['Urban vs Suburban avg', '', '$12-15 / $8-10', 'Toast POS 2025'],
    ['Digital payment uplift', '+$2.28 (card)', '+$5.02 (other)', 'Wiley JAAEA 2024'],
    ['Vendor avg weekly revenue', '$200-1,600', '$4,800-9,600', 'Industry surveys'],
    ['Vendor avg annual revenue', '$25K-70K', '$250K-500K', 'USDA / FoodTruckProfit'],
  ];

  benchmarks[0].forEach((h, i) => {
    const cell = ws6.getCell(4, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = headerFill('FF546E7A');
    cell.border = thinBorder;
  });

  benchmarks.slice(1).forEach((row, i) => {
    row.forEach((val, j) => {
      const cell = ws6.getCell(5 + i, j + 1);
      cell.value = val;
      cell.border = thinBorder;
    });
  });

  [30, 16, 16, 55].forEach((w, i) => { ws6.getColumn(i + 1).width = w; });

  // Data sources
  ws6.getCell('A14').value = 'DATA SOURCES FOR MARKET INPUT';
  ws6.getCell('A14').font = { bold: true, size: 12 };

  const sources = [
    ['Data Needed', 'Source', 'URL'],
    ['Farm count by county', 'USDA Census of Agriculture 2022', 'https://www.nass.usda.gov/AgCensus/'],
    ['Farmers market count', 'USDA AMS National FM Directory', 'https://www.usdalocalfoodportal.com/fe/fdirectory_farmersmarket/'],
    ['Median household income', 'US Census Bureau ACS', 'https://data.census.gov'],
    ['Population by city/county', 'US Census QuickFacts', 'https://www.census.gov/quickfacts'],
    ['Growing season (frost-free days)', 'Old Farmer\'s Almanac / NOAA', 'https://www.almanac.com/gardening/frostdates'],
    ['Food truck regulations by state', 'WorldPopulationReview', 'https://worldpopulationreview.com/state-rankings/food-truck-regulations-by-state'],
    ['University enrollment', 'NCES IPEDS', 'https://nces.ed.gov/ipeds/'],
    ['Food truck count estimate', 'Google Maps / Yelp search', 'Search "[city] food trucks" on Google Maps'],
    ['FM industry stats', 'Farmers Market Coalition', 'https://farmersmarketcoalition.org/'],
    ['FT industry stats', 'FoodTruckProfit 2026 Survey', 'https://www.foodtruckprofit.com/food-truck-statistics'],
    ['FT industry analysis', 'IBISWorld', 'https://www.ibisworld.com/united-states/industry/food-trucks/4322/'],
    ['Consumer spending patterns', 'Penn State Extension', 'https://extension.psu.edu/analysis-of-the-2024-farmers-market-assessment-survey'],
  ];

  sources[0].forEach((h, i) => {
    const cell = ws6.getCell(15, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = headerFill('FF546E7A');
    cell.border = thinBorder;
  });

  sources.slice(1).forEach((row, i) => {
    row.forEach((val, j) => {
      const cell = ws6.getCell(16 + i, j + 1);
      cell.value = val;
      cell.border = thinBorder;
      if (j === 2 && val.startsWith('http')) {
        cell.value = { text: val, hyperlink: val };
        cell.font = { color: { argb: 'FF1565C0' }, underline: true };
      }
    });
  });

  ws6.getColumn(3).width = 65;

  // Seasonality table
  ws6.getCell('A30').value = 'FM SEASONALITY MULTIPLIERS';
  ws6.getCell('A30').font = { bold: true, size: 12 };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmSeason = [0.15, 0.20, 0.35, 0.55, 0.80, 1.00, 1.00, 0.95, 0.85, 0.65, 0.35, 0.25];
  const ftSeason = [0.60, 0.65, 0.75, 0.85, 0.95, 1.00, 1.00, 0.95, 0.90, 0.80, 0.70, 0.60];

  ['Month', 'FM Multiplier', 'FT Multiplier'].forEach((h, i) => {
    const cell = ws6.getCell(31, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = headerFill('FF546E7A');
    cell.border = thinBorder;
  });

  months.forEach((m, i) => {
    ws6.getCell(32 + i, 1).value = m;
    ws6.getCell(32 + i, 1).border = thinBorder;
    ws6.getCell(32 + i, 2).value = fmSeason[i];
    ws6.getCell(32 + i, 2).numFmt = '0%';
    ws6.getCell(32 + i, 2).border = thinBorder;
    ws6.getCell(32 + i, 3).value = ftSeason[i];
    ws6.getCell(32 + i, 3).numFmt = '0%';
    ws6.getCell(32 + i, 3).border = thinBorder;
  });

  ws6.getCell(44, 1).value = 'Avg Factor:';
  ws6.getCell(44, 1).font = { bold: true };
  ws6.getCell(44, 2).value = { formula: 'AVERAGE(B32:B43)' };
  ws6.getCell(44, 2).numFmt = '0%';
  ws6.getCell(44, 2).font = { bold: true };
  ws6.getCell(44, 3).value = { formula: 'AVERAGE(C32:C43)' };
  ws6.getCell(44, 3).numFmt = '0%';
  ws6.getCell(44, 3).font = { bold: true };

  // Score weight reference
  ws6.getCell('A47').value = 'SCORING WEIGHTS';
  ws6.getCell('A47').font = { bold: true, size: 12 };

  const weights = [
    ['Factor', 'FM Weight', 'FT Weight'],
    ['Population', '15%', '20%'],
    ['Median Income', '15%', '10%'],
    ['Market/Truck Density', '15%', '10%'],
    ['Farm Density / University', '15%', '15%'],
    ['Growing Season / Climate', '10%', '5%'],
    ['Community Fit', '10%', '10%'],
    ['Economy Type / Regulatory', '5%', '10%'],
    ['Tourism', '5%', '10%'],
    ['Competition', '5%', '5%'],
    ['Local Champion', '5%', '5%'],
  ];

  weights[0].forEach((h, i) => {
    const cell = ws6.getCell(48, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = headerFill('FF546E7A');
    cell.border = thinBorder;
  });

  weights.slice(1).forEach((row, i) => {
    row.forEach((val, j) => {
      const cell = ws6.getCell(49 + i, j + 1);
      cell.value = val;
      cell.border = thinBorder;
      if (j > 0) cell.alignment = { horizontal: 'center' };
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════════════
  const outputPath = path.join(__dirname, 'Geographic_Expansion_Planner.xlsx');
  await wb.xlsx.writeFile(outputPath);
  console.log(`Workbook saved to: ${outputPath}`);
}

buildWorkbook().catch(console.error);
