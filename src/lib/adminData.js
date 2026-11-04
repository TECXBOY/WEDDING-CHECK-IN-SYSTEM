export const ADMIN_PAGE_SIZE = 50
export const ADMIN_EXPORT_LIMIT = 5000

export async function fetchAdminPages(rpc, functionName, parameters = {}, {
  pageSize = ADMIN_PAGE_SIZE,
  maxRows = ADMIN_EXPORT_LIMIT,
} = {}) {
  const rows = []
  let totalRows = null

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await rpc(functionName, {
      ...parameters,
      p_offset: offset,
      p_limit: pageSize,
    })
    if (error) throw error

    const page = data || []
    if (totalRows === null && page.length) totalRows = Number(page[0].total_rows)
    rows.push(...page)

    if (page.length < pageSize || (totalRows !== null && rows.length >= totalRows)) {
      return { rows, totalRows: totalRows ?? rows.length }
    }
  }

  if (totalRows !== null && totalRows > rows.length) {
    throw new Error(`Export is limited to ${maxRows} records. Apply a filter and try again.`)
  }
  return { rows, totalRows: totalRows ?? rows.length }
}

export function attendanceStatus(guest) {
  if (guest.checked_in_count === 0) return 'Not checked in'
  if (guest.checked_in_count >= guest.invited_count) return 'Fully checked in'
  return 'Partially checked in'
}

export function attendancePercentage(checkedIn, expected) {
  if (!Number.isFinite(Number(expected)) || Number(expected) <= 0) return 0
  const percent = (Number(checkedIn) / Number(expected)) * 100
  return Number.isFinite(percent) ? percent : 0
}

export function formatCsv(rows, columns) {
  const quote = (value) => {
    let text = value == null ? '' : String(value)
    if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  const header = columns.map(([, label]) => quote(label)).join(',')
  const body = rows.map((row) => columns.map(([field]) => quote(row[field])).join(','))
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`
}

export function parseGuestCsv(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { headers: [], rows: [], fatalError: 'The CSV file is empty.' }
  }

  const records = []
  let record = []
  let field = ''
  let quoted = false
  let afterQuote = false
  let rowNumber = 1

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          afterQuote = true
        }
      } else {
        field += char
        if (char === '\n') rowNumber += 1
      }
      continue
    }

    if (afterQuote && char !== ',' && char !== '\r' && char !== '\n' && char !== ' ' && char !== '\t') {
      return { headers: [], rows: [], fatalError: `Unexpected character after a quoted value near line ${rowNumber}.` }
    }

    if (char === '"' && field.length === 0 && !afterQuote) {
      quoted = true
    } else if (char === ',' || char === '\r' || char === '\n') {
      record.push(field)
      field = ''
      afterQuote = false
      if (char === ',') continue
      if (char === '\r' && text[index + 1] === '\n') index += 1
      if (record.some((value) => value.trim() !== '')) records.push(record)
      record = []
      rowNumber += 1
    } else if (!afterQuote) {
      field += char
    }
  }

  if (quoted) return { headers: [], rows: [], fatalError: 'The CSV contains an unclosed quoted field.' }
  if (field !== '' || record.length) {
    record.push(field)
    if (record.some((value) => value.trim() !== '')) records.push(record)
  }
  if (!records.length) return { headers: [], rows: [], fatalError: 'The CSV file has no data.' }

  const headers = records[0].map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim().toLowerCase(),
  )
  const unexpectedHeaders = headers.filter(
    (header) => !['full_name', 'household_name', 'invited_count', 'notes'].includes(header),
  )
  if (headers.some((header) => !header)) {
    return { headers, rows: [], unexpectedHeaders, fatalError: 'Every CSV column must have a header.' }
  }
  if (new Set(headers).size !== headers.length) {
    return { headers, rows: [], unexpectedHeaders, fatalError: 'The CSV contains duplicate column headers.' }
  }
  for (const required of ['full_name', 'invited_count']) {
    if (!headers.includes(required)) {
      return { headers, rows: [], unexpectedHeaders, fatalError: `The required "${required}" column is missing.` }
    }
  }

  const rows = records.slice(1).map((values, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ''])),
    errors: values.length > headers.length ? ['This row has more values than the header.'] : [],
  }))
  if (!rows.length) {
    return { headers, rows: [], unexpectedHeaders, fatalError: 'The CSV file contains headers but no guest rows.' }
  }

  const seen = new Set()
  for (const row of rows) {
    const fullName = row.values.full_name.trim()
    const householdName = (row.values.household_name || '').trim()
    const notes = row.values.notes || ''
    const invitedRaw = row.values.invited_count.trim()
    const invited = Number(invitedRaw)
    if (!fullName) row.errors.push('Guest name is required.')
    if (fullName.length > 200) row.errors.push('Guest name must be 200 characters or fewer.')
    if (householdName.length > 200) row.errors.push('Household name must be 200 characters or fewer.')
    if (notes.length > 1000) row.errors.push('Notes must be 1000 characters or fewer.')
    if (!/^[1-9]\d*$/.test(invitedRaw) || !Number.isSafeInteger(invited) || invited > 2147483647) {
      row.errors.push('Invited count must be a positive whole number.')
    }
    row.data = {
      full_name: fullName,
      household_name: householdName || null,
      invited_count: invited,
      notes: notes || null,
    }

    const duplicateKey = `${fullName.toLocaleLowerCase()}|${householdName.toLocaleLowerCase()}`
    if (!row.errors.length && seen.has(duplicateKey)) row.duplicate = true
    if (!row.errors.length && fullName) seen.add(duplicateKey)
  }

  return { headers, rows, unexpectedHeaders, fatalError: '' }
}
