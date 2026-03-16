// ═══════════════════════════════════════════════════════════
// fileManager.js — File Intake, Parsing & Schema Detection
// ═══════════════════════════════════════════════════════════

const FileManager = (() => {
  const _files = {};    // filename → FileEntry
  const _queue = [];    // processing queue

  // ── FILE TYPE BADGE ──────────────────────────────────────
  const getBadgeClass = (ext) => {
    const map = {
      xlsx: 'excel', xls: 'excel', csv: 'csv',
      pdf: 'pdf',
      doc: 'word', docx: 'word',
      txt: 'txt',
      zip: 'zip', rar: 'zip',
    };
    return map[ext] || 'txt';
  };
  const getBadgeLabel = (ext) => {
    const map = { xlsx:'XLSX', xls:'XLS', csv:'CSV', pdf:'PDF',
                  doc:'DOC', docx:'DOCX', txt:'TXT', zip:'ZIP', rar:'RAR' };
    return map[ext] || ext.toUpperCase();
  };

  // ── SCHEMA DETECTION ────────────────────────────────────
  const detectSchema = (headers, rows) => {
    const haystack = (headers.join(' ') + ' ' + rows.slice(0, 5).map(r => Object.values(r).join(' ')).join(' ')).toLowerCase();
    let best = { schema: 'UNKNOWN', score: 0 };
    for (const [schema, keywords] of Object.entries(CONFIG.SCHEMA_PATTERNS)) {
      const score = keywords.filter(k => haystack.includes(k)).length / keywords.length;
      if (score > best.score) best = { schema, score };
    }
    return best.score >= CONFIG.SCHEMA_CONFIDENCE_THRESHOLD ? best.schema : 'UNKNOWN';
  };

  // ── COLUMN NORMALIZER ────────────────────────────────────
  // Maps various column names to canonical names
  const HEADER_MAP = {
    // ── MAIN LED (Lease Expiry Database) ──────────────────
    'building': 'building',
    'complex': 'complex',
    'tenant': 'tenant',
    'landlord': 'landlord',
    'developer': 'developer',
    'micro market': 'location',
    'micro markets': 'location',
    'macro market': 'macroMarket',
    'market': 'market',
    'floor': 'floor',
    'carpet area': 'carpet',
    'chargeable area': 'bua',
    'current rent (chargeable)': 'rent',
    'starting rent (chargeable)': 'startRent',
    'future rent (chargeable)': 'futureRent',
    'effective rent': 'effectiveRent',
    'current rent (carpet)': 'rentCarpet',
    'lease expiry date': 'endDate',
    'renewal lease expiry date': 'renewalExpiry',
    'lockin period': 'lockIn',
    'lockin expiry date': 'lockInExpiry',
    'lock-in expiry rental': 'lockInRent',
    'notice period': 'noticePeriod',
    'lease term': 'leaseTerm',
    'commencement date': 'startDate',
    'sign date': 'signDate',
    'sector': 'sector',
    'grade': 'grade',
    'status': 'status',
    'space type': 'spaceType',
    'property condition': 'condition',
    'cam charges': 'cam',
    'rent escalation': 'escalation',
    'landlord representative': 'landlordContact',
    'tenant representative': 'tenantContact',
    'tenant/landlord contacts': 'contactDetails',
    'no of seats': 'seats',
    'units': 'units',
    'cre id': 'creId',
    'deal memo': 'dealMemo',
    'year': 'expiryYear',

    // ── DATABASE FILE (Property Inventory) ────────────────
    'building name': 'building',
    'add/street name': 'address',
    'location': 'location',
    'micro-market': 'location',
    'available (yes/no)': 'availability',
    'lease/ sale /selfuse/pre-lease/proposed': 'dealType',
    'developer/ investor/ landlord': 'landlord',
    'contacts details': 'contactDetails',
    'email id': 'email',
    'unit no': 'unitNo',
    'bua (sq.ft)': 'bua',
    'carpet area (sq.ft)': 'carpet',
    'efficiency (%)': 'efficiency',
    'quoted rent/sq.ft./per mth.': 'rent',
    'quoted sale price/ sq.ft.': 'salePrice',
    'maintenance': 'cam',
    'taxes': 'taxes',
    'handover cond': 'condition',
    'handover cond details': 'conditionDetails',
    'possession': 'possession',
    'car park ratio(sq.ft)': 'parkingRatio',
    'car park charges(per car/month)': 'parkingCharges',
    'building structure': 'structure',
    'floor plate': 'floorPlate',
    'remarks': 'remarks',

    // ── GENERIC FALLBACKS ─────────────────────────────────
    'property name': 'building', 'tower': 'building',
    'area': 'location',
    'bua': 'bua', 'built up area': 'bua',
    'carpet': 'carpet',
    'rent': 'rent', 'asking rent': 'rent', 'quoted rent': 'rent', 'rental': 'rent',
    'lock in': 'lockIn', 'lock-in': 'lockIn', 'lock in period': 'lockIn',
    'expiry date': 'endDate', 'end date': 'endDate', 'lease end': 'endDate',
    'commencement': 'startDate', 'start date': 'startDate',
    'contact person': 'contactDetails', 'poc': 'contactDetails',
    'phone': 'phone', 'mobile': 'phone', 'contact no': 'phone',
    'email': 'email', 'e-mail': 'email',
    'designation': 'role', 'title': 'role',
    'requirement': 'requirement', 'budget': 'budget',
    'industry': 'sector', 'timeline': 'timeline',
    'stage': 'stage', 'broker': 'broker',
  };

  const normalizeHeaders = (rawHeaders) => {
    return rawHeaders.map(h => {
      const lc = (h || '').toLowerCase().trim();
      return HEADER_MAP[lc] || lc.replace(/\s+/g, '_');
    });
  };

  // Parse phone/email out of free-text contact strings
  const _extractContact = (str) => {
    if (!str) return { phone: '', email: '' };
    const phone = (str.match(/(\+?[0-9]{10,13})/)||[])[1] || '';
    const email = (str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/)||[])[1] || '';
    return { phone, email };
  };

  // ── ROW MAPPER ───────────────────────────────────────────
  const mapRowToEntity = (row, schema, source) => {
    const r = row;
    const rawContact = r.contactDetails || r.landlordContact || r.tenantContact || '';
    const { phone: cPhone, email: cEmail } = _extractContact(rawContact);

    switch (schema) {
      case 'PROPERTY_INVENTORY':
        KnowledgeGraph.addProperty({
          building:     r.building || '',
          location:     r.location || r.address || '',
          floor:        r.floor || '',
          bua:          r.bua || '',
          carpet:       r.carpet || '',
          rent:         r.rent || '',
          salePrice:    r.salePrice || '',
          availability: r.availability || 'Unknown',
          dealType:     r.dealType || '',
          condition:    r.condition || r.conditionDetails || '',
          cam:          r.cam || '',
          landlord:     r.landlord || '',
          contact:      rawContact,
          phone:        cPhone,
          email:        r.email || cEmail,
          possession:   r.possession || '',
          remarks:      r.remarks || '',
        }, source);
        if (rawContact || r.email) {
          KnowledgeGraph.addContact({
            name:     rawContact.split(/[-,]/)[0].trim() || r.landlord || '',
            company:  r.building || '',
            role:     'Landlord/Contact',
            phone:    cPhone,
            email:    r.email || cEmail,
            building: r.building || '',
          }, source);
        }
        break;

      case 'LEASE_DATABASE':
        KnowledgeGraph.addLease({
          tenant:       r.tenant || '',
          landlord:     r.landlord || r.developer || '',
          building:     r.building || r.complex || '',
          location:     r.location || '',
          macroMarket:  r.macroMarket || r.market || '',
          floor:        r.floor || '',
          carpet:       r.carpet || '',
          bua:          r.bua || '',
          rent:         r.rent || r.effectiveRent || '',
          startRent:    r.startRent || '',
          futureRent:   r.futureRent || '',
          startDate:    r.startDate || '',
          endDate:      r.endDate || '',
          expiryYear:   r.expiryYear || '',
          lockIn:       r.lockIn || '',
          lockInExpiry: r.lockInExpiry || '',
          noticePeriod: r.noticePeriod || '',
          leaseTerm:    r.leaseTerm || '',
          cam:          r.cam || '',
          escalation:   r.escalation || '',
          grade:        r.grade || '',
          sector:       r.sector || '',
          spaceType:    r.spaceType || '',
          condition:    r.condition || '',
          seats:        r.seats || '',
          status:       r.status || '',
          landlordRep:  r.landlordContact || '',
          tenantRep:    r.tenantContact || '',
        }, source);
        if (r.landlordContact) {
          const lc = _extractContact(r.landlordContact);
          KnowledgeGraph.addContact({
            name:     r.landlordContact.split(',')[0].trim(),
            company:  r.landlord || r.building || '',
            role:     'Landlord Representative',
            phone:    lc.phone, email: lc.email,
            building: r.building || '',
          }, source);
        }
        if (r.tenantContact) {
          const tc = _extractContact(r.tenantContact);
          KnowledgeGraph.addContact({
            name:     r.tenantContact.split(',')[0].trim(),
            company:  r.tenant || '',
            role:     'Tenant Representative',
            phone:    tc.phone, email: tc.email,
            building: r.building || '',
          }, source);
        }
        break;

      case 'TENANT_DATABASE':
        KnowledgeGraph.addTenant({
          company:     r.tenant || r.building || '',
          sector:      r.sector || '',
          requirement: r.requirement || r.bua || r.carpet || '',
          budget:      r.budget || r.rent || '',
          timeline:    r.timeline || r.possession || '',
          contact:     rawContact,
          phone:       cPhone,
          email:       r.email || cEmail,
        }, source);
        break;

      case 'CONTACT_LIST':
        KnowledgeGraph.addContact({
          name:     r.name || rawContact.split(/[-,]/)[0].trim() || '',
          company:  r.building || '',
          role:     r.role || r.designation || '',
          phone:    r.phone || cPhone,
          email:    r.email || cEmail,
          building: r.building || '',
        }, source);
        break;

      case 'DEAL_PIPELINE':
        KnowledgeGraph.addDeal({
          stage:    r.stage || '',
          broker:   r.broker || '',
          client:   r.tenant || '',
          property: r.building || '',
          status:   r.status || '',
          notes:    r.remarks || '',
        }, source);
        break;

      default:
        if (rawContact || r.email) {
          KnowledgeGraph.addContact({
            name:    rawContact.split(/[-,]/)[0].trim() || '',
            company: r.building || '',
            role:    r.role || '',
            phone:   cPhone,
            email:   r.email || cEmail,
          }, source);
        }
    }
  };

  // ── EXCEL / CSV PARSER ───────────────────────────────────
  const parseExcel = async (file) => {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array', cellDates: true });
    const results = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rawRows || rawRows.length < 2) continue;

      // Find actual header row (first non-empty row)
      let headerIdx = 0;
      while (headerIdx < rawRows.length && rawRows[headerIdx].every(c => c === '')) headerIdx++;
      if (headerIdx >= rawRows.length) continue;

      const rawHeaders = rawRows[headerIdx].map(h => (h || '').toString().trim());
      const normalHeaders = normalizeHeaders(rawHeaders);
      const dataRows = rawRows.slice(headerIdx + 1).filter(r => r.some(c => c !== ''));

      const rowObjects = dataRows.map(row => {
        const obj = {};
        normalHeaders.forEach((h, i) => { if (h) obj[h] = row[i] !== undefined ? row[i].toString().trim() : ''; });
        return obj;
      });

      const schema = detectSchema(normalHeaders, rowObjects);
      results.push({ sheetName, headers: normalHeaders, rows: rowObjects, schema, count: rowObjects.length });
    }
    return results;
  };

  // ── PDF PARSER ───────────────────────────────────────────
  const parsePDF = async (file) => {
    const ab = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return { text: fullText, pages: pdf.numPages };
  };

  // ── DOCX PARSER ──────────────────────────────────────────
  const parseDOCX = async (file) => {
    const ab = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: ab });
    return { text: result.value };
  };

  // ── TXT PARSER ───────────────────────────────────────────
  const parseTXT = async (file) => {
    const text = await file.text();
    // Detect if CSV-like
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length > 1) {
      const delimiters = [',', '\t', '|', ';'];
      for (const d of delimiters) {
        const firstLine = lines[0].split(d);
        if (firstLine.length >= 3) {
          return { type: 'csv-like', delimiter: d, text };
        }
      }
    }
    return { type: 'freetext', text };
  };

  // ── ZIP PARSER ───────────────────────────────────────────
  const parseZIP = async (file) => {
    const ab = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(ab);
    const inner = [];
    const promises = [];
    zip.forEach((path, zipEntry) => {
      if (!zipEntry.dir) {
        promises.push(
          zipEntry.async('blob').then(blob => {
            const ext = path.split('.').pop().toLowerCase();
            const innerFile = new File([blob], path.split('/').pop(), { type: blob.type });
            inner.push({ name: path, file: innerFile, ext });
          })
        );
      }
    });
    await Promise.all(promises);
    return inner;
  };

  // ── PROCESS A SINGLE FILE ────────────────────────────────
  // ✅ NEW format — destructure the callbacks object
const processFile = async (file, { onProgress, onComplete, onError }) => {

    const ext = file.name.split('.').pop().toLowerCase();
    const source = file.name;

    try {
      onProgress(10, 'Extracting...');

      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        let sheets;
        if (ext === 'csv') {
          const text = await file.text();
          const wb = XLSX.read(text, { type: 'string', cellDates: true });
          const wsName = wb.SheetNames[0];
          const ws = wb.Sheets[wsName];
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (rawRows.length < 2) { onComplete(0, 'Empty', 'CSV'); return; }
          const rawHeaders = rawRows[0].map(h => (h || '').toString().trim());
          const normalHeaders = normalizeHeaders(rawHeaders);
          const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));
          const rowObjects = dataRows.map(row => {
            const obj = {};
            normalHeaders.forEach((h, i) => { if (h) obj[h] = (row[i] || '').toString().trim(); });
            return obj;
          });
          const schema = detectSchema(normalHeaders, rowObjects);
          sheets = [{ sheetName: 'Sheet1', headers: normalHeaders, rows: rowObjects, schema, count: rowObjects.length }];
        } else {
          sheets = await parseExcel(file);
        }

        onProgress(50, 'Detecting schema...');

        let totalRows = 0;
        let detectedSchema = 'UNKNOWN';
        const CHUNK = 500; // process 500 rows at a time to keep UI responsive

        for (const sheet of sheets) {
          detectedSchema = sheet.schema !== 'UNKNOWN' ? sheet.schema : detectedSchema;
          totalRows += sheet.count;
          const rows = sheet.rows;
          for (let i = 0; i < rows.length; i += CHUNK) {
            const chunk = rows.slice(i, i + CHUNK);
            chunk.forEach(row => mapRowToEntity(row, sheet.schema, source));
            const pct = 50 + Math.round(((i + CHUNK) / rows.length) * 30);
            onProgress(Math.min(pct, 80), `Processing rows ${i + 1}–${Math.min(i + CHUNK, rows.length)} of ${rows.length}...`);
            // Yield to browser to prevent freeze
            await new Promise(r => setTimeout(r, 0));
          }
        }

        onProgress(85, 'Building index...');
        KnowledgeGraph.registerFile(source, {
          schema: detectedSchema, rowCount: totalRows, sheetCount: sheets.length,
        });

        onProgress(100, '');
        onComplete(totalRows, detectedSchema, ext.toUpperCase(), sheets.length);

      } else if (ext === 'pdf') {
        const { text, pages } = await parsePDF(file);
        onProgress(60, 'Extracting text...');
        KnowledgeGraph.addRawText(source, text);
        KnowledgeGraph.registerFile(source, { schema: 'PDF_DOCUMENT', rowCount: pages, sheetCount: 1 });
        onProgress(100, '');
        onComplete(pages, 'PDF_DOCUMENT', 'PDF', 1);

      } else if (['doc', 'docx'].includes(ext)) {
        const { text } = await parseDOCX(file);
        onProgress(60, 'Extracting text...');
        KnowledgeGraph.addRawText(source, text);
        KnowledgeGraph.registerFile(source, { schema: 'WORD_DOCUMENT', rowCount: 1, sheetCount: 1 });
        onProgress(100, '');
        onComplete(1, 'WORD_DOCUMENT', ext.toUpperCase(), 1);

      } else if (ext === 'txt') {
        const result = await parseTXT(file);
        onProgress(60, 'Detecting format...');
        if (result.type === 'csv-like') {
          const lines = result.text.split('\n').filter(l => l.trim());
          const headers = normalizeHeaders(lines[0].split(result.delimiter).map(h => h.trim()));
          const rows = lines.slice(1).map(l => {
            const vals = l.split(result.delimiter);
            const obj = {};
            headers.forEach((h, i) => { if (h) obj[h] = (vals[i] || '').trim(); });
            return obj;
          });
          const schema = detectSchema(headers, rows);
          rows.forEach(r => mapRowToEntity(r, schema, source));
          KnowledgeGraph.registerFile(source, { schema, rowCount: rows.length, sheetCount: 1 });
          onProgress(100, '');
          onComplete(rows.length, schema, 'TXT', 1);
        } else {
          KnowledgeGraph.addRawText(source, result.text);
          KnowledgeGraph.registerFile(source, { schema: 'FREE_TEXT', rowCount: 1, sheetCount: 1 });
          onProgress(100, '');
          onComplete(1, 'FREE_TEXT', 'TXT', 1);
        }

      } else if (['zip', 'rar'].includes(ext)) {
        if (ext === 'rar') {
          KnowledgeGraph.addRawText(source, 'RAR file detected. Please extract and upload individual files.');
          KnowledgeGraph.registerFile(source, { schema: 'RAR_ARCHIVE', rowCount: 0, sheetCount: 0 });
          onError('⚠️ RAR format detected. Please extract and re-upload individual files for full processing.');
          return;
        }
        onProgress(30, 'Extracting archive...');
        const innerFiles = await parseZIP(file);
        onProgress(50, `Found ${innerFiles.length} files inside...`);
        let totalRows = 0;
        for (const inner of innerFiles) {
          await processFile(inner.file,
            (pct, step) => onProgress(50 + Math.round(pct * 0.4), `[${inner.ext}] ${step}`),
            (rows) => { totalRows += rows; },
            (err) => console.warn('Inner file error:', err)
          );
        }
        KnowledgeGraph.registerFile(source, { schema: 'ZIP_ARCHIVE', rowCount: totalRows, sheetCount: innerFiles.length });
        onProgress(100, '');
        onComplete(totalRows, 'ZIP_ARCHIVE', 'ZIP', innerFiles.length);

      } else {
        onError(`⚠️ Unsupported file type: .${ext}. Supported: Excel, CSV, PDF, Word, TXT, ZIP.`);
      }

    } catch (err) {
      console.error('File processing error:', err);
      onError(`⚠️ Could not read ${file.name}. Please re-upload or convert to CSV/PDF.`);
    }
  };

  // ── PUBLIC API ───────────────────────────────────────────
  return {
    getBadgeClass,
    getBadgeLabel,
    processFile,
    getFiles: () => _files,
    hasFile: (name) => !!_files[name],
    removeFile: (name) => {
      delete _files[name];
      // NOTE: KnowledgeGraph data from this file remains for session integrity;
      // a full reset is done via clearSession.
    },
    registerFile: (name) => { _files[name] = true; },
    fileCount: () => Object.keys(_files).length,
    maxReached: () => Object.keys(_files).length >= CONFIG.MAX_FILES_PER_SESSION,
  };
})();

window.FileManager = FileManager;
