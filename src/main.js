import Alpine from 'alpinejs'
import './style.css'
import * as XLSX from 'xlsx'

const STORAGE_KEY = 'testcase-tool-state-v1'
const DEFAULT_FILE = '测试用例.csv'
const CSV_HEADERS = ['测试用例ID', '测试模块', '测试场景', '前置条件', '测试步骤', '预期结果', '优先级', '备注']
const STATUS_OPTIONS = ['未执行', '通过', '失败', '阻塞', '跳过']
const PRIORITY_ORDER = ['高', '中', '低']

const formatDateTime = (value) => {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const escapeCsvField = (str = '') => {
  const value = String(str ?? '')
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

const splitCsvLine = (line) => {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      const nextIsQuote = line[i + 1] === '"'
      if (inQuotes && nextIsQuote) {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

const parseCsv = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitCsvLine)

const parseXlsx = (arrayBuffer) => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[firstSheetName]
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
  return data.filter(row => row.some(cell => cell !== ''))
}

const normalizeSteps = (raw = '') =>
  raw
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

const summarize = (cases) => {
  const statusCount = STATUS_OPTIONS.reduce((acc, cur) => ({ ...acc, [cur]: 0 }), {})
  const priorityCount = PRIORITY_ORDER.reduce((acc, cur) => ({ ...acc, [cur]: 0 }), { 其他: 0 })
  cases.forEach((c) => {
    if (statusCount[c.status] !== undefined) statusCount[c.status] += 1
    if (PRIORITY_ORDER.includes(c.priority)) priorityCount[c.priority] += 1
    else priorityCount.其他 += 1
  })
  const total = cases.length
  const executed = total - (statusCount['未执行'] || 0)
  const passRate = total ? Math.round(((statusCount['通过'] || 0) / total) * 100) : 0
  return { total, executed, statusCount, priorityCount, passRate }
}

const casesToCsv = (cases) => {
  const header = [...CSV_HEADERS, '执行状态', '实际结果', '最后更新时间']
  const rows = cases.map((item) => [
    item.id,
    item.module,
    item.scenario,
    item.precondition,
    item.steps.join('\n'),
    item.expected,
    item.priority,
    item.remark,
    item.status,
    item.actual ?? '',
    item.updatedAt ? formatDateTime(item.updatedAt) : '',
  ])
  return [header, ...rows].map((r) => r.map(escapeCsvField).join(',')).join('\n')
}

const buildReportCsv = (cases) => {
  const { total, executed, statusCount, priorityCount, passRate } = summarize(cases)
  const failed = cases.filter((c) => c.status === '失败')
  const blocked = cases.filter((c) => c.status === '阻塞')
  const abnormal = [...failed, ...blocked]

  const rows = [
    ['摘要', '值'],
    ['用例总数', total],
    ['已执行', executed],
    ['通过', statusCount['通过'] || 0],
    ['失败', statusCount['失败'] || 0],
    ['阻塞', statusCount['阻塞'] || 0],
    ['跳过', statusCount['跳过'] || 0],
    ['通过率', `${passRate}%`],
    ['高/中/低优先级', `${priorityCount['高']}/${priorityCount['中']}/${priorityCount['低']}`],
    [],
    ['异常用例汇总', '模块', '场景', '状态', '备注/实际'],
  ]

  if (!abnormal.length) {
    rows.push(['无异常', '', '', '', ''])
  } else {
    abnormal.forEach((item) =>
      rows.push([
        item.id,
        item.module || '未分组',
        item.scenario,
        item.status,
        item.actual || item.remark || '-',
      ])
    )
  }

  rows.push([])
  rows.push(['当前筛选用例', '模块', '场景', '状态', '优先级', '预期结果', '实际/备注'])
  cases.forEach((item) =>
    rows.push([
      item.id,
      item.module || '未分组',
      item.scenario,
      item.status,
      item.priority || '-',
      item.expected,
      item.actual || item.remark || '-',
    ])
  )

  return rows.map((r) => r.map(escapeCsvField).join(',')).join('\n')
}

const priorityBadge = (priority) => {
  switch (priority) {
    case '高':
      return 'text-red-600'
    case '中':
      return 'text-amber-600'
    case '低':
      return 'text-emerald-600'
    default:
      return 'text-slate-700'
  }
}

const statusBadge = (status) => {
  switch (status) {
    case '通过':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case '失败':
      return 'bg-red-50 text-red-700 ring-red-200'
    case '阻塞':
      return 'bg-amber-50 text-amber-700 ring-amber-200'
    case '跳过':
      return 'bg-blue-50 text-blue-700 ring-blue-200'
    default:
      return 'bg-slate-50 text-slate-600 ring-slate-200'
  }
}

const downloadFile = (filename, content) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

window.Alpine = Alpine

Alpine.data('testcaseApp', () => ({
  cases: [],
  modules: [],
  filters: {
    search: '',
    module: '',
    priority: '',
    status: '',
    onlyChanged: false,
    onlyFailed: false,
  },
  statusOptions: STATUS_OPTIONS,
  sourceFile: DEFAULT_FILE,
  message: '',
  loading: false,
  lastSavedAt: null,
  view: 'table',
  dirty: false,
  editingItem: null,
  saveWithBackup: false,
  editForm: {
    module: '',
    scenario: '',
    priority: '',
    precondition: '',
    editingSteps: '',
    expected: '',
    actual: '',
  },

  init() {
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
          const wantBackup = confirm('有未保存修改，是否导出备份？选择“确定”将导出备份并离开，“取消”留在页面。')
          if (wantBackup) {
            this.exportCsv(true)
            return
          }
          e.preventDefault()
          e.returnValue = ''
      }
    })
    this.restoreFromLocal()
    if (!this.cases.length) {
      this.loadDefault()
    } else {
      this.refreshLookups()
    }
  },

  toast(msg) {
    this.message = msg
    setTimeout(() => {
      this.message = ''
    }, 2000)
  },

  async loadDefault() {
    this.loading = true
    try {
      const res = await fetch(`/${DEFAULT_FILE}?t=${Date.now()}`)
      if (!res.ok) throw new Error('默认 CSV 加载失败')
      const text = await res.text()
      this.applyCsv(text, DEFAULT_FILE)
      this.toast('已加载默认 CSV')
    } catch (err) {
      this.toast(err.message || '加载失败')
    } finally {
      this.loading = false
    }
  },

  handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    
    const fileName = file.name.toLowerCase()
    const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
    
    const reader = new FileReader()
    reader.onload = (e) => {
      if (isXlsx) {
        const rows = parseXlsx(e.target.result)
        this.applyRows(rows, file.name)
        this.toast('已导入本地 Excel')
      } else {
        this.applyCsv(e.target.result, file.name)
        this.toast('已导入本地 CSV')
      }
    }
    
    if (isXlsx) {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file, 'utf-8')
    }
    event.target.value = ''
  },

  applyRows(rows, filename = DEFAULT_FILE) {
    if (!rows.length) {
      this.toast('文件内容为空')
      return
    }
    const headerLine = rows[0]
    const startIndex = headerLine[0] && headerLine[0].includes('测试用例') ? 1 : 0
    const savedMap = this.cases.reduce((acc, item) => {
      acc[item.id] = item
      return acc
    }, {})

    this.cases = rows.slice(startIndex).map((row) => {
      const [id, module, scenario, precondition, steps, expected, priority, remark] = [
        row[0] || '',
        row[1] || '',
        row[2] || '',
        row[3] || '',
        row[4] || '',
        row[5] || '',
        row[6] || '',
        row[7] || '',
      ]
      const saved = savedMap[id] || {}
      return {
        id,
        module,
        scenario,
        precondition,
        steps: normalizeSteps(String(steps)),
        expected,
        priority,
        remark,
        status: saved.status || '未执行',
        actual: saved.actual || '',
        updatedAt: saved.updatedAt || '',
      }
    })

    this.sourceFile = filename
    this.refreshLookups()
    this.dirty = false
  },

  applyCsv(text, filename = DEFAULT_FILE) {
    const rows = parseCsv(text)
    this.applyRows(rows, filename)
  },

  refreshLookups() {
    this.modules = Array.from(new Set(this.cases.map((c) => c.module).filter(Boolean))).sort()
  },

  filteredCases() {
    const search = this.filters.search.trim().toLowerCase()
    return this.cases.filter((item) => {
      if (this.filters.module && item.module !== this.filters.module) return false
      if (this.filters.priority && item.priority !== this.filters.priority) return false
      if (this.filters.status && item.status !== this.filters.status) return false
      if (this.filters.onlyChanged && item.status === '未执行' && !item.actual) return false
      if (this.filters.onlyFailed && !['失败', '阻塞'].includes(item.status)) return false
      if (search) {
        const haystack = [item.id, item.module, item.scenario, item.expected, item.remark, item.actual]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  },

  statCards() {
    const { total, executed, statusCount, passRate } = summarize(this.cases)
    return [
      {
        label: '用例总数',
        value: total,
        sub: '全部',
        badgeClass: 'bg-slate-100 text-slate-700 ring-slate-200',
        desc: '含未执行用例',
      },
      {
        label: '已执行',
        value: executed,
        sub: `${total ? Math.round((executed / total) * 100) : 0}%`,
        badgeClass: 'bg-blue-50 text-blue-700 ring-blue-200',
        desc: `未执行：${statusCount['未执行'] || 0}`,
      },
      {
        label: '通过 / 失败 / 阻塞',
        value: `${statusCount['通过'] || 0} / ${statusCount['失败'] || 0} / ${statusCount['阻塞'] || 0}`,
        sub: `通过率 ${passRate}%`,
        badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        desc: `跳过：${statusCount['跳过'] || 0}`,
      },
    ]
  },

  setStatus(item, status) {
    item.status = status
    item.updatedAt = new Date().toISOString()
    this.markDirty()
  },

  setAllStatus(status) {
    this.filteredCases().forEach((item) => {
      item.status = status
      item.updatedAt = new Date().toISOString()
    })
    this.markDirty()
  },

  startEdit(item) {
    this.editingItem = item
    this.editForm = {
      module: item.module,
      scenario: item.scenario,
      priority: item.priority,
      precondition: item.precondition,
      editingSteps: item.steps.join('\n'),
      expected: item.expected,
      actual: item.actual,
    }
  },

  cancelEdit() {
    this.editingItem = null
    this.saveWithBackup = false
  },

  saveEdit(withBackup = false) {
    if (!this.editingItem) return
    const target = this.editingItem
    target.module = this.editForm.module
    target.scenario = this.editForm.scenario
    target.priority = this.editForm.priority
    target.precondition = this.editForm.precondition
    target.steps = normalizeSteps(this.editForm.editingSteps || '')
    target.expected = this.editForm.expected
    target.actual = this.editForm.actual
    target.updatedAt = new Date().toISOString()
    this.markDirty()
    this.persist()
    if (withBackup) {
      this.exportCsv(true)
    }
    this.editingItem = null
    this.saveWithBackup = false
    this.toast(withBackup ? '已保存并导出备份' : '已保存修改')
  },

  resetFilters() {
    this.filters = {
      search: '',
      module: '',
      priority: '',
      status: '',
      onlyChanged: false,
      onlyFailed: false,
    }
  },

  quickFilter(type) {
    if (type === '高') {
      this.filters.priority = '高'
    } else if (type === '失败') {
      this.filters.status = '失败'
    } else if (type === '阻塞') {
      this.filters.status = '阻塞'
    }
  },

  markDirty() {
    this.dirty = true
  },

  persist(showToast = false, askBackup = false) {
    if (askBackup && confirm('是否导出备份？')) {
      this.exportCsv(true)
    }
    const payload = {
      cases: this.cases,
      sourceFile: this.sourceFile,
      lastSavedAt: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    this.lastSavedAt = payload.lastSavedAt
    this.dirty = false
    if (showToast) this.toast('已保存到浏览器')
  },

  restoreFromLocal() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const data = JSON.parse(raw)
      this.cases = data.cases || []
      this.sourceFile = data.sourceFile || DEFAULT_FILE
      this.lastSavedAt = data.lastSavedAt || null
    } catch (err) {
      console.error(err)
    }
  },

  backupFilename() {
    const base = (this.sourceFile || '测试用例.csv').replace(/\.csv$/i, '')
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
      d.getMinutes()
    )}`
    return `${base}-${stamp}.csv`
  },

  exportCsv(isBackup = false) {
    if (!this.cases.length) {
      this.toast('无数据可导出')
      return
    }
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
    const filename = isBackup ? this.backupFilename() : `测试用例-执行结果-${stamp}.csv`
    downloadFile(filename, casesToCsv(this.cases))
    this.toast(isBackup ? '已导出备份' : '已导出 CSV')
  },

  generateReport() {
    const current = this.filteredCases()
    if (!current.length) {
      this.toast('无数据可导出')
      return
    }
    const confirmed = confirm('生成报告并下载 CSV？包含概要与异常信息。')
    if (!confirmed) return
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
    downloadFile(`测试报告-${stamp}.csv`, buildReportCsv(current))
    this.toast('报告已下载')
  },

  clearLocal() {
    localStorage.removeItem(STORAGE_KEY)
    this.toast('已清除本地缓存')
    setTimeout(() => {
      window.location.reload()
    }, 500)
  },

  copyTemplate() {
    const text = CSV_HEADERS.join(',') + '（注：测试步骤中可用<br>换行）'
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this.toast('已复制用例模版表头'),
        () => this.fallbackCopy(text)
      )
    } else {
      this.fallbackCopy(text)
    }
  },

  fallbackCopy(text) {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    this.toast('已复制用例模版表头')
  },

  priorityBadge,
  statusBadge,
  formatDateTime,
}))

Alpine.start()
