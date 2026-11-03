import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import Papa from "papaparse"
import {
  Activity, AlertTriangle, ArrowRight, Bell,
  BookOpen, BrainCircuit, Check, CheckCircle2, ChevronDown, CircleHelp,
  Download, FileSpreadsheet, Filter, GraduationCap, LayoutDashboard,
  LoaderCircle, Menu, Moon, MoreHorizontal, Plus, Search, ShieldCheck,
  Sparkles, Sun, Target, Trash2, UploadCloud, Users, X, Zap,
} from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"
import { useTheme } from "@/components/theme-provider"

type Risk = "High Risk" | "Safe" | "Unclassified"
type Student = {
  student_id: string; name: string; major: string; GPA: number; attendance_rate: number;
  avg_course_grade: number; prediction: Risk; attendance_alert: boolean;
  assignment_submission_rate: number; video_completion_rate: number;
  lms_logins_past_month: number; enrollment_status: string; age?: number;
  gender?: string; course_load?: number | string; avg_session_duration_minutes?: number;
  forum_participation_count?: number;
  academic_year?: string | null; semester?: number | null; section?: string | null;
}
type Prediction = {
  student_id?: string | null; prediction: Risk;
  class_probabilities: Record<string, number>; attendance_alert: boolean; disclaimer?: string;
}
type View = "Overview" | "Students" | "Assessment" | "Batch import" | "Recommendations"
type AcademicYear = {id:number;name:string;semesters:{id:number;name:string;number:number;sections:{id:number;name:string}[]}[]}


const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
const percent = (n:number) => `${Math.round(n*100)}%`
const initials = (name:string) => name.split(" ").map(s=>s[0]).slice(0,2).join("").toUpperCase()
const errorMessage = (e:unknown) => e instanceof Error ? e.message : "Something went wrong."
function recommendMetaFallback(meta:{prediction:Risk;attendanceAlert:boolean;probabilities?:Record<string,number>;createdAt?:string}|null) {
  if(!meta) return null
  return <div className="plan-evidence"><p>Academic status from current model: <strong>{meta.prediction}</strong>{meta.probabilities?.[meta.prediction]!==undefined?` · ${Math.round(meta.probabilities[meta.prediction]*100)}% class probability`:""}.</p><p>{meta.attendanceAlert?"Separate attendance follow-up is flagged.":"No separate attendance follow-up is flagged."} Subject-level evidence is not supplied unless listed in the plan.</p></div>
}

function RecommendationContent({ text }: { text: string }) {
  const headings = ["PLAN TYPE:", "MAIN GOAL:", "WHY THIS PLAN:", "PRIORITY ACTIONS:", "PERSONALIZED 7-DAY PLAN:", "TEACHER SUPPORT:", "ATTENDANCE FOLLOW-UP:", "SUCCESS MEASURES:", "NEXT REVIEW:"]
  return <div className="recommendation-content">{text.split("\n").map((raw, i) => { const line=raw.trim(); if(!line) return <div className="recommendation-spacer" key={i}/>; const heading=headings.find(h=>line.toUpperCase().startsWith(h)); if(heading) return <h3 key={i}>{heading.replace(":","")}{line.length>heading.length?<span>{line.slice(heading.length)}</span>:null}</h3>; const bullet=/^[-•*]\s/.test(line)||/^\d+[.)]\s/.test(line); const clean=line.replace(/^[-•*]+\s*/,"").replace(/^\d+[.)]\s*/,""); return bullet?<p className="recommendation-bullet" key={i}><span>•</span>{clean}</p>:<p key={i}>{clean}</p> })}</div>
}

function App() {
  const { theme, setTheme } = useTheme()
  const currentHour = new Date().getHours()
  const timeGreeting = currentHour < 12 ? "Good morning" : currentHour < 17 ? "Good afternoon" : "Good evening"
  const [view,setView] = useState<View>("Overview")
  const [students,setStudents] = useState<Student[]>([])
  const [studentsLoading,setStudentsLoading] = useState(true)
  const [studentsError,setStudentsError] = useState("")
  const [query,setQuery] = useState("")
  const [riskFilter,setRiskFilter] = useState("All students")
  const [apiOnline,setApiOnline] = useState<boolean|null>(null)
  const [selected,setSelected] = useState<Student|null>(null)
  const [mobileNav,setMobileNav] = useState(false)
  const [toast,setToast] = useState("")
  const [busy,setBusy] = useState(false)
  const [prediction,setPrediction] = useState<Prediction|null>(null)
  const [assessmentErrors,setAssessmentErrors] = useState<Record<string,string>>({})
  const [form,setForm] = useState({student_id:"STU-NEW-01",GPA:"7.2",attendance:"82",grade:"74",assignments:"80",video:"75",major:"Computer Science",age:"20",logins:"25",duration:"18",forums:"5",skills:"JavaScript, SQL",interests:"Full-stack development",projects:"Built a basic portfolio website",goal:"Software development internship"})
  const [recommendation,setRecommendation] = useState("")
  const [recommendationMeta,setRecommendationMeta] = useState<{prediction:Risk;attendanceAlert:boolean;probabilities?:Record<string,number>;createdAt?:string}|null>(null)
  const [recommendationLoading,setRecommendationLoading] = useState(false)
  const [recommendationHistory,setRecommendationHistory] = useState<{id:number;created_at:string;recommendation:string;academic_prediction:string;attendance_alert:boolean}[]>([])
  const [historyLoading,setHistoryLoading] = useState(false)
  const [csvRows,setCsvRows] = useState<Record<string,unknown>[]>([])
  const [batchResults,setBatchResults] = useState<(Prediction & Record<string,unknown>)[]>([])
  const [csvName,setCsvName] = useState("")
  const [csvFile,setCsvFile] = useState<File|null>(null)
  const [csvError,setCsvError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging,setDragging] = useState(false)
  const [academicYears,setAcademicYears] = useState<AcademicYear[]>([])
  const [selectedAcademicYear,setSelectedAcademicYear] = useState("All")
  const [selectedSemester,setSelectedSemester] = useState("All")
  const [selectedSection,setSelectedSection] = useState("All")
  const [uploadAcademicYear,setUploadAcademicYear] = useState("")
  const [uploadSemester,setUploadSemester] = useState("")
  const [uploadSection,setUploadSection] = useState("")
  const [academicDialog,setAcademicDialog] = useState<{type:"academic_year"|"semester"|"section";parentId?:number;parentLabel?:string}|null>(null)
  const [academicName,setAcademicName] = useState("")
  const [academicNumber,setAcademicNumber] = useState("")
  const [academicSaving,setAcademicSaving] = useState(false)

  const refreshStudents = useCallback(async () => {
    setStudentsLoading(true);setStudentsError("")
    try {
      const response=await fetch(`${API_BASE}/students`)
      if(!response.ok)throw new Error(`HTTP ${response.status}`)
      const data=await response.json() as {students?:Record<string,unknown>[]}
      const byId=new Map<string,Student>()
      for(const r of data.students??[]){
        const id=String(r.student_id??"").trim();if(!id)continue
        const classification:Risk=r.prediction==="High Risk"?"High Risk":r.prediction==="Safe"?"Safe":"Unclassified"
        byId.set(id,{student_id:id,name:String(r.name??id),major:String(r.major??"Not specified"),GPA:Number(r.GPA??0),attendance_rate:Number(r.attendance_rate??0),avg_course_grade:Number(r.avg_course_grade??0),prediction:classification,attendance_alert:Boolean(r.attendance_alert),assignment_submission_rate:Number(r.assignment_submission_rate??0),video_completion_rate:Number(r.video_completion_rate??0),lms_logins_past_month:Number(r.lms_logins_past_month??0),enrollment_status:String(r.enrollment_status??"Active"),age:r.age as number|undefined,gender:r.gender as string|undefined,academic_year:r.academic_year as string|undefined,semester:r.semester==null?null:Number(r.semester),section:r.section as string|undefined})
      }
      setStudents(Array.from(byId.values()))
    } catch {
      setStudents([]);setStudentsError("Student records could not be loaded. Check the database connection and try again.")
    } finally {setStudentsLoading(false)}
  },[])
  const refreshAcademicStructure = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/academic-structure`)
      if (!response.ok) throw new Error("Academic structure unavailable")
      const data = await response.json() as {academic_years?:AcademicYear[]}
      setAcademicYears(data.academic_years ?? [])
    } catch { setAcademicYears([]) }
  },[])
  useEffect(()=>{
    fetch(`${API_BASE}/health`).then(r=>r.ok?r.json():Promise.reject()).then(d=>setApiOnline(Boolean(d.model_loaded))) .catch(()=>setApiOnline(false))
    void refreshStudents()
    void refreshAcademicStructure()
  },[refreshStudents,refreshAcademicStructure])
  useEffect(()=>{ if(!toast) return; const id=window.setTimeout(()=>setToast(""),3500); return ()=>window.clearTimeout(id) },[toast])

  const scopedStudents = students.filter(st=>(selectedAcademicYear==="All"||st.academic_year===selectedAcademicYear)&&(selectedSemester==="All"||String(st.semester)===selectedSemester)&&(selectedSection==="All"||st.section===selectedSection))
  const highRisk = scopedStudents.filter(s=>s.prediction==="High Risk").length
  const safeCount = scopedStudents.filter(s=>s.prediction==="Safe").length
  const unclassifiedCount=scopedStudents.length-highRisk-safeCount
  const classifiedCount=highRisk+safeCount
  const attendanceAlerts = scopedStudents.filter(s=>s.attendance_alert).length
  const majorRiskData=useMemo(()=>{
    const grouped=new Map<string,{major:string;safe:number;risk:number;unclassified:number;total:number}>()
    scopedStudents.forEach(s=>{
      const major=s.major.trim()&&s.major!=="Not specified"?s.major:"Not specified"
      const item=grouped.get(major)??{major,safe:0,risk:0,unclassified:0,total:0}
      if(s.prediction==="Safe")item.safe+=1
      else if(s.prediction==="High Risk")item.risk+=1
      else item.unclassified+=1
      item.total+=1;grouped.set(major,item)
    })
    return Array.from(grouped.values()).sort((a,b)=>b.total-a.total||a.major.localeCompare(b.major)).slice(0,8)
  },[scopedStudents])
  const filtered = useMemo(()=>students.filter(s=>{
    const matches = `${s.student_id} ${s.name} ${s.major}`.toLowerCase().includes(query.toLowerCase())
    const academicMatch=(selectedAcademicYear==="All"||s.academic_year===selectedAcademicYear)&&(selectedSemester==="All"||String(s.semester)===selectedSemester)&&(selectedSection==="All"||s.section===selectedSection)
    return matches && academicMatch && (riskFilter==="All students" || (riskFilter==="Attendance alert" ? s.attendance_alert : s.prediction===riskFilter))
  }),[students,query,riskFilter,selectedAcademicYear,selectedSemester,selectedSection])

  const navigate = (v:View) => { setView(v); setMobileNav(false); setSelected(null) }
  const updateForm = (key:keyof typeof form,value:string) => {setForm(f=>({...f,[key]:value}));setAssessmentErrors(errors=>{const next={...errors};delete next[key];return next})}
  const recordPayload = (row:Record<string,unknown>) => {
    const normalized:Record<string,unknown> = {}
    for (const [k,v] of Object.entries(row)) normalized[k.trim()] = v
    const get = (...keys:string[]) => { const found=keys.find(k=>normalized[k]!==undefined && normalized[k]!==""); return found ? normalized[found] : undefined }
    const number = (v:unknown, fallback:number) => v===undefined || v===null || v==="" ? fallback : Number(v)
    const rate = (v:unknown, fallback:number) => { const n=number(v,fallback); return n>1?n/100:n }
    return {
      student_id:String(get("student_id","Student ID","studentId","id") ?? `CSV-${Math.random().toString(36).slice(2,8).toUpperCase()}`),
      name:String(get("name","Name","student_name","Student Name") ?? get("student_id","Student ID","studentId","id") ?? "Imported student"),
      age:number(get("age","Age"),20), gender:String(get("gender","Gender") ?? "Not specified"),
      major:String(get("major","Major","department","Department") ?? "Not specified"),
      GPA:number(get("GPA","gpa","CGPA","cgpa"),7),
      course_load:number(get("course_load","courseLoad","Course Load"),5),
      avg_course_grade:number(get("avg_course_grade","avgCourseGrade","Average Course Grade","grade"),70),
      attendance_rate:rate(get("attendance_rate","attendanceRate","Attendance Rate","attendance_percent","attendance"),.8),
      enrollment_status:String(get("enrollment_status","Enrollment Status") ?? "Active"),
      lms_logins_past_month:number(get("lms_logins_past_month","LMS Logins"),20),
      avg_session_duration_minutes:number(get("avg_session_duration_minutes","Average Session Duration"),20),
      assignment_submission_rate:rate(get("assignment_submission_rate","Assignment Submission Rate","assignments"),.8),
      forum_participation_count:number(get("forum_participation_count","Forum Participation"),5),
      video_completion_rate:rate(get("video_completion_rate","Video Completion Rate","video"),.75),
      academic_year:String(get("academic_year","Academic Year","batch") ?? (uploadAcademicYear || "")),
      semester:(Number.parseInt(String(get("semester","Semester") ?? uploadSemester),10)||null),
      section:String(get("section","Section") ?? (uploadSection || "")),
    }
  }
  const assess = async (payload:Record<string,unknown>) => {
    setBusy(true); setPrediction(null)
    try {
      const response=await fetch(`${API_BASE}/predict`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
      const data=await response.json()
      if(!response.ok) throw new Error(data.detail ? JSON.stringify(data.detail) : `API returned ${response.status}`)
      setPrediction(data); setApiOnline(true); setToast("Assessment completed using the connected model.")
    } catch(e) {
      setApiOnline(false)
      console.error("EduPredict assessment request failed", { payload, error: e })
      const message=errorMessage(e)
      setToast(message.includes("422") ? `Assessment data was rejected (422). Open DevTools → Console for request details; check required fields and allowed ranges. ${message}` : `Could not reach the model API: ${message}. Check that the FastAPI server is running.`)
    }
    finally { setBusy(false) }
  }
  const submitAssessment = (e:FormEvent) => {
    e.preventDefault()
    const bounded:[string,keyof typeof form,number,number,boolean?][]=[["CGPA","GPA",0,10,true],["Average course grade","grade",0,100],["Attendance","attendance",0,100,true],["Assignment submission","assignments",0,100],["Video completion","video",0,100],["Age","age",0,120],["LMS logins","logins",0,Number.MAX_SAFE_INTEGER],["Average session duration","duration",0,Number.MAX_SAFE_INTEGER],["Forum participation","forums",0,Number.MAX_SAFE_INTEGER]]
    const errors:Record<string,string>={}
    if(!form.student_id.trim())errors.student_id="Enter a student ID to identify this assessment."
    bounded.forEach(([label,key,min,max,required])=>{const raw=String(form[key]).trim();if(!raw&&!required)return;const value=Number(raw);if(!raw||!Number.isFinite(value)||value<min||value>max)errors[key]=`${label} must be between ${min} and ${max===Number.MAX_SAFE_INTEGER?"a valid non-negative value":max}.`})
    setAssessmentErrors(errors)
    if(Object.keys(errors).length)return
    const payload=recordPayload({student_id:form.student_id,GPA:form.GPA,attendance_rate:form.attendance,avg_course_grade:form.grade,assignment_submission_rate:form.assignments,video_completion_rate:form.video,major:form.major,age:form.age,lms_logins_past_month:form.logins,avg_session_duration_minutes:form.duration,forum_participation_count:form.forums})
    void assess(payload)
  }
  const handleCsv = (file?:File) => {
    if(!file) return
    setCsvFile(file);setCsvName(file.name);setCsvRows([]);setCsvError("");setBatchResults([])
    if(!file.name.toLowerCase().endsWith(".csv")&&file.type!=="text/csv"){setCsvError("Choose a .csv file to continue.");return}
    Papa.parse<Record<string,unknown>>(file,{header:true,skipEmptyLines:true,complete:(results)=>{
      const rows=results.data.filter(r=>Object.values(r).some(v=>String(v??"").trim()))
      if(results.errors.length){setCsvError(`Could not parse CSV: ${results.errors[0].message}`);return}
      if(!results.meta.fields?.length){setCsvError("This CSV needs a header row and at least one data column.");return}
      if(!rows.length){setCsvError("No data rows were found in this file.");return}
      setCsvRows(rows); setToast(`${rows.length} rows loaded. Review the preview before running batch assessment.`)
    },error:err=>setCsvError(`CSV could not be read: ${err.message}`)})
  }
  const clearCsv = () => {setCsvFile(null);setCsvName("");setCsvRows([]);setCsvError("");setBatchResults([]);if(fileRef.current)fileRef.current.value=""}
  const runBatch = async () => {
    if(!csvRows.length) return
    setBusy(true)
    try {
      const payload=csvRows.slice(0,500).map(recordPayload)
      const response=await fetch(`${API_BASE}/predict-batch`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
      const data=await response.json()
      if(!response.ok) throw new Error(data.detail ? JSON.stringify(data.detail) : `API returned ${response.status}`)
      const results=(data.predictions as Prediction[]).map((p:Prediction,i:number)=>({...p,...payload[i]}))
      setBatchResults(results); setApiOnline(true); setToast(`Completed assessment for ${results.length} students.`)
      const saveResponse=await fetch(`${API_BASE}/students/bulk`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(results.map((r,i)=>({...payload[i],student_id:String(r.student_id??payload[i].student_id),name:String(r.student_id??payload[i].student_id),prediction:r.prediction,attendance_alert:r.attendance_alert,class_probabilities:r.class_probabilities})))})
      if(!saveResponse.ok){const err=await saveResponse.json().catch(()=>({})); throw new Error(err.detail?String(err.detail):`Could not save records to MySQL (HTTP ${saveResponse.status})`)}
      await refreshStudents()
      setToast(`Assessed and saved ${results.length} students to MySQL.`)
    } catch(e) { setApiOnline(false); setToast(`Batch request failed: ${errorMessage(e)}. Check that the backend is running.`) }
    finally { setBusy(false) }
  }
  const downloadBatch = () => {
    const rows=batchResults.map(r=>({student_id:r.student_id??"",GPA:r.GPA??"",attendance_rate:r.attendance_rate??"",prediction:r.prediction,high_risk_probability:r.class_probabilities?.["High Risk"]??"",safe_probability:r.class_probabilities?.Safe??"",attendance_alert:r.attendance_alert}))
    const csv=Papa.unparse(rows); const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"})); const a=document.createElement("a"); a.href=url; a.download="edupredict-assessment-results.csv"; a.click(); URL.revokeObjectURL(url)
  }
  const requestRecommendations = async (student?: Student) => {
    setRecommendationLoading(true); setRecommendation("");setRecommendationMeta(null)
    if (student) navigate("Recommendations")
    const payload = student ? {
      student_id: student.student_id, name: student.name, GPA: student.GPA,
      attendance_rate: student.attendance_rate, avg_course_grade: student.avg_course_grade,
      assignment_submission_rate: student.assignment_submission_rate,
      video_completion_rate: student.video_completion_rate, major: student.major,
      age: student.age, lms_logins_past_month: student.lms_logins_past_month,
      skills: form.skills, interests: form.interests, projects: form.projects, career_goal: form.goal,
    } : {
      student_id: form.student_id, GPA: Number(form.GPA), attendance_rate: Number(form.attendance)/100,
      avg_course_grade: Number(form.grade), assignment_submission_rate: Number(form.assignments)/100,
      video_completion_rate: Number(form.video)/100, major: form.major, age: Number(form.age),
      lms_logins_past_month: Number(form.logins), avg_session_duration_minutes: Number(form.duration),
      forum_participation_count: Number(form.forums), skills: form.skills, interests: form.interests,
      projects: form.projects, career_goal: form.goal,
    }
    try {
      const response=await fetch(`${API_BASE}/recommendations`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
      const data=await response.json()
      if(!response.ok) throw new Error(data.detail ? String(data.detail) : `API returned ${response.status}`)
      setRecommendation(typeof data.recommendation === "string" ? data.recommendation : "")
      setRecommendationMeta({prediction:data.academic_prediction,attendanceAlert:Boolean(data.attendance_alert),probabilities:data.class_probabilities,createdAt:data.created_at})
      setToast(`AI support plan generated for ${payload.student_id}.`)
    } catch { setRecommendation("");setRecommendationMeta(null);setToast("The plan could not be generated. Check the recommendation service and try again.") }
    finally { setRecommendationLoading(false) }
  }

  const loadRecommendationHistory = async () => {
    const id=form.student_id.trim(); if(!id){setToast("Enter a student ID first.");return}
    setHistoryLoading(true)
    try { const response=await fetch(`${API_BASE}/students/${encodeURIComponent(id)}/recommendations`); const data=await response.json(); if(!response.ok) throw new Error(data.detail?String(data.detail):`API returned ${response.status}`); setRecommendationHistory(data.recommendations??[]); setToast(`Loaded ${data.count??0} saved plan(s) for ${id}.`) }
    catch(e){setToast(`Could not load recommendation history: ${errorMessage(e)}`)} finally {setHistoryLoading(false)}
  }

  const openAcademicDialog = (type:"academic_year"|"semester"|"section", parent?:AcademicYear|AcademicYear["semesters"][number]) => {
    setAcademicName("")
    setAcademicNumber(type==="semester"?"1":"")
    setAcademicDialog({
      type,
      parentId: parent?.id,
      parentLabel: type==="semester" ? (parent as AcademicYear|undefined)?.name : type==="section" ? (parent as AcademicYear["semesters"][number]|undefined)?.name : undefined
    })
  }
  const createAcademicItem = async () => {
    if(!academicDialog) return
    const name=academicName.trim()
    if(!name){setToast("Please enter a name.");return}
    const body:Record<string,unknown>={type:academicDialog.type,name}
    if(academicDialog.type==="semester"){
      const number=Number(academicNumber)
      if(!Number.isInteger(number)||number<1||number>12){setToast("Semester number must be between 1 and 12.");return}
      body.academic_year_id=academicDialog.parentId
      body.semester_number=number
    }
    if(academicDialog.type==="section") body.semester_id=academicDialog.parentId
    setAcademicSaving(true)
    try {
      const response=await fetch(`${API_BASE}/academic-structure`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      const data=await response.json()
      if(!response.ok) throw new Error(data.detail??"Could not create academic item")
      await refreshAcademicStructure()
      setAcademicDialog(null)
      setToast(data.message??"Academic structure updated.")
    } catch(e) { setToast(errorMessage(e)) }
    finally {setAcademicSaving(false)}
  }

  const deleteAcademicItem = async (type:"academic_year"|"semester"|"section", id:number, label:string) => {
    const confirmed=window.confirm(`Delete ${label}? This action cannot be undone. Items containing child records or students cannot be deleted.`);
    if(!confirmed) return;
    try {
      const response=await fetch(`${API_BASE}/academic-structure/${type}/${id}`,{method:"DELETE"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.detail??"Could not delete academic item.");
      if(type==="academic_year" && selectedAcademicYear===label){setSelectedAcademicYear("All");setSelectedSemester("All");setSelectedSection("All");}
      if(type==="semester"){
        const parent=academicYears.find(y=>y.semesters.some(s=>s.id===id));
        const sem=parent?.semesters.find(s=>s.id===id);
        if(parent?.name===selectedAcademicYear && String(sem?.number)===selectedSemester){setSelectedSemester("All");setSelectedSection("All");}
      }
      if(type==="section" && selectedSection===label) setSelectedSection("All");
      await refreshAcademicStructure();
      await refreshStudents();
      setToast(`${label} deleted.`);
    } catch(e) { setToast(errorMessage(e)); }
  }

  const navItems:{label:View;icon:typeof LayoutDashboard;group:string}[]=[
    {label:"Overview",icon:LayoutDashboard,group:"WORKSPACE"},
    {label:"Students",icon:Users,group:"WORKSPACE"},
    {label:"Assessment",icon:Target,group:"TOOLS"},
    {label:"Batch import",icon:FileSpreadsheet,group:"TOOLS"},
    {label:"Recommendations",icon:Sparkles,group:"TOOLS"},
  ]
  const exportStudents = () => {
    const csv=Papa.unparse(students.map(s=>({...s,attendance_rate:Math.round(s.attendance_rate*100)+"%"})))
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"})); const a=document.createElement("a"); a.href=url; a.download="edupredict-student-overview.csv"; a.click(); URL.revokeObjectURL(url)
  }

  return <div className="app-shell">
    {mobileNav&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav?"sidebar-open":""}`}>
      <div className="brand"><div className="brand-mark"><BrainCircuit size={22}/></div><div><div className="brand-name">EduPredict<span>AI</span></div><div className="brand-caption">STUDENT SUCCESS PLATFORM</div></div><button className="icon-button mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="workspace-switch"><div className="workspace-icon"><GraduationCap size={18}/></div><div className="workspace-copy"><strong>Academic workspace</strong><span>Student success workspace</span></div><ChevronDown size={15} className="muted-icon"/></div>
      <div className="sidebar-scroll">
      {["WORKSPACE","TOOLS"].map(group=><div className="nav-group" key={group}><div className="nav-label">{group}</div>{navItems.filter(n=>n.group===group).map(item=><button key={item.label} onClick={()=>navigate(item.label)} className={`nav-item ${view===item.label?"nav-active":""}`} aria-current={view===item.label?"page":undefined}><item.icon size={18}/><span>{item.label}</span>{item.label==="Students"&&<span className="nav-count">{students.length}</span>}</button>)}</div>)}
      <div className="nav-group academic-nav"><div className="academic-nav-heading"><span className="nav-label">ACADEMIC STRUCTURE</span><button className="icon-button" aria-label="Create academic year" title="Create academic year" onClick={()=>openAcademicDialog("academic_year")}><Plus size={16}/></button></div>
        {academicYears.map(year=><div className="academic-year-node" key={year.id}><div className="academic-row-wrap academic-row-actions"><button className="academic-tree-row" onClick={()=>{setSelectedAcademicYear(year.name);setSelectedSemester("All");setSelectedSection("All");navigate("Overview")}}><span>▸</span><strong>{year.name}</strong><small>{students.filter(st=>st.academic_year===year.name).length}</small></button><button className="academic-add" title="Add semester" aria-label={`Add semester to ${year.name}`} onClick={()=>openAcademicDialog("semester",year)}><Plus size={13}/></button><button className="academic-delete" title={`Delete ${year.name}`} aria-label={`Delete ${year.name}`} onClick={()=>deleteAcademicItem("academic_year",year.id,year.name)}><Trash2 size={13}/></button></div>
          {year.semesters.map(sem=><div className="academic-child" key={sem.id}><div className="academic-row-wrap academic-row-actions"><button className="academic-tree-row" onClick={()=>{setSelectedAcademicYear(year.name);setSelectedSemester(String(sem.number));setSelectedSection("All");navigate("Overview")}}><span>▾</span>{sem.name}</button><button className="academic-add" title="Add section" aria-label={`Add section to ${sem.name}`} onClick={()=>openAcademicDialog("section",sem)}><Plus size={13}/></button><button className="academic-delete" title={`Delete ${sem.name}`} aria-label={`Delete ${sem.name}`} onClick={()=>deleteAcademicItem("semester",sem.id,`${year.name} / ${sem.name}`)}><Trash2 size={13}/></button></div>
            {sem.sections.map(section=><div className="academic-row-wrap academic-row-actions section-row-wrap" key={section.id}><button className={`academic-section-row ${selectedAcademicYear===year.name&&selectedSemester===String(sem.number)&&selectedSection===section.name?"selected":""}`} onClick={()=>{setSelectedAcademicYear(year.name);setSelectedSemester(String(sem.number));setSelectedSection(section.name);navigate("Overview")}}> <Users size={13}/>{section.name}<small>{students.filter(st=>st.academic_year===year.name&&String(st.semester)===String(sem.number)&&st.section===section.name).length}</small></button><button className="academic-delete" title={`Delete ${section.name}`} aria-label={`Delete ${section.name}`} onClick={()=>deleteAcademicItem("section",section.id,`${year.name} / ${sem.name} / ${section.name}`)}><Trash2 size={13}/></button></div>)}
          </div>)}
        </div>)}
        {academicYears.length===0&&<p className="academic-empty">Create an academic year to get started.</p>}
      </div>
      </div>
      <div className="sidebar-bottom"><div className="profile-row"><div className="profile-avatar">AD</div><div className="profile-text"><strong>Academic Admin</strong><span>Demo workspace</span></div><MoreHorizontal size={18} className="muted-icon"/></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-trigger" aria-label="Open menu" onClick={()=>setMobileNav(true)}><Menu size={19}/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{view}</strong></div></div><div className="topbar-actions"><div className={`api-status ${apiOnline===true?"status-online":apiOnline===false?"status-offline":""}`}><span className="status-dot"/>{apiOnline===true?"Model API connected":apiOnline===false?"Model API offline":"Checking model API"}</div><button className="icon-button" aria-label="Toggle theme" onClick={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-button notification-button" aria-label="Notifications" onClick={()=>setToast(`${attendanceAlerts} student records currently trigger the attendance alert.`)}><Bell size={18}/><span/></button><div className="topbar-avatar">AD</div></div></header>
      <div className="page-content">
        {view==="Overview"&&<><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> STUDENT SUCCESS INTELLIGENCE</div><h1>{timeGreeting}, Academic Team <span className="wave">✦</span></h1><p className="page-subtitle">A clear view of student engagement, risk indicators, and where support can make a difference.</p><div className="scope-context"><span>VIEWING</span><strong>{selectedAcademicYear==="All"?"All academic years":selectedAcademicYear}</strong><i>/</i><strong>{selectedSemester==="All"?"All semesters":`${selectedSemester}${Number(selectedSemester)===1?"st":Number(selectedSemester)===2?"nd":Number(selectedSemester)===3?"rd":"th"} Semester`}</strong><i>/</i><strong>{selectedSection==="All"?"All sections":selectedSection}</strong></div></div><div className="heading-actions"><button className="button button-secondary" onClick={exportStudents}><Download size={16}/> Export report</button><button className="button button-secondary" onClick={()=>{setUploadAcademicYear(selectedAcademicYear==="All"?"":selectedAcademicYear);setUploadSemester(selectedSemester==="All"?"":selectedSemester);setUploadSection(selectedSection==="All"?"":selectedSection);navigate("Batch import")}}><FileSpreadsheet size={16}/> Batch import</button><button className="button button-primary" onClick={()=>navigate("Assessment")}><Plus size={17}/> New assessment</button></div></div>
          <div className="metric-grid">
            <Metric icon={<Users size={18}/>} label="Students in workspace" value={studentsLoading?"—":scopedStudents.length.toLocaleString()} trend={studentsLoading?"Loading records":"Unique student records"} tone="blue" foot="In this workspace"/>
            <Metric icon={<AlertTriangle size={18}/>} label="Flagged high risk" value={studentsLoading?"—":highRisk.toLocaleString()} trend={studentsLoading?"Loading records":`${classifiedCount?Math.round(highRisk/classifiedCount*100):0}% of classified`} tone="rose" foot="ML classification"/>
            <Metric icon={<CheckCircle2 size={18}/>} label="Currently marked safe" value={studentsLoading?"—":safeCount.toLocaleString()} trend={studentsLoading?"Loading records":`${classifiedCount?Math.round(safeCount/classifiedCount*100):0}% of classified`} tone="green" foot="Not currently flagged"/>
            <Metric icon={<Activity size={18}/>} label="Attendance alerts" value={studentsLoading?"—":attendanceAlerts.toLocaleString()} trend={studentsLoading?"Loading records":"≤ 65% attendance"} tone="amber" foot="Separate rule-based alert"/>
          </div>
          {studentsError&&<div className="dashboard-alert" role="alert"><span>{studentsError}</span><button className="button button-secondary" onClick={()=>void refreshStudents()}>Retry</button></div>}
          {unclassifiedCount>0&&!studentsLoading&&!studentsError&&<p className="dashboard-data-note">{unclassifiedCount} student {unclassifiedCount===1?"record is":"records are"} unclassified. Risk percentages use classified records only.</p>}
          <div className="dashboard-grid"><section className="panel trend-panel"><div className="panel-heading"><div><h2>Current risk by major</h2><p>Current classifications across the 8 largest majors · unique records</p></div></div>{studentsLoading?<div className="chart-state">Loading student classifications…</div>:studentsError?<div className="chart-state">Chart unavailable until student records load.</div>:majorRiskData.length===0?<div className="chart-state">No student records are available to chart yet.</div>:<><div className="chart-legend"><span><i className="legend-dot legend-safe"/>Safe</span><span><i className="legend-dot legend-risk"/>High Risk</span>{majorRiskData.some(major=>major.unclassified>0)&&<span><i className="legend-dot legend-unclassified"/>Unclassified</span>}</div><div className="trend-chart major-risk-chart" style={{height:Math.max(220,majorRiskData.length*42)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={majorRiskData} layout="vertical" margin={{top:8,right:16,left:12,bottom:4}} barCategoryGap="28%"><CartesianGrid strokeDasharray="3 5" horizontal={false} stroke="var(--chart-grid)"/><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{fill:"var(--muted-foreground)",fontSize:11}}/><YAxis type="category" dataKey="major" width={130} axisLine={false} tickLine={false} tick={{fill:"var(--muted-foreground)",fontSize:11}}/><Tooltip contentStyle={{background:"var(--popover)",border:"1px solid var(--border)",borderRadius:10,color:"var(--foreground)",fontSize:12}} labelStyle={{fontWeight:700}} formatter={(value,name,item)=>{const row=item.payload as {total:number};const count=Number(value??0);return [`${count} (${row.total?Math.round(count/row.total*100):0}%)`,name]}}/><Bar dataKey="safe" name="Safe" stackId="classification" fill="#39856b" radius={[0,0,0,0]}/><Bar dataKey="risk" name="High Risk" stackId="classification" fill="#d77b6d"/><Bar dataKey="unclassified" name="Unclassified" stackId="classification" fill="#9aa4ae" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div><div className="chart-footnote"><span className="footnote-dot"/>Historical prediction events are not stored; this view uses current student records.</div></>}</section>
            <section className="panel distribution-panel"><div className="panel-heading"><div><h2>Current classification</h2><p>Classified student records</p></div><button className="icon-button subtle" aria-label="View students" onClick={()=>navigate("Students")}><ArrowRight size={17}/></button></div>{studentsLoading?<div className="chart-state compact">Loading counts…</div>:studentsError?<div className="chart-state compact">Classification unavailable until records load.</div>:classifiedCount===0?<div className="chart-state compact">No classified student records yet.</div>:<><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{name:"Safe",value:safeCount},{name:"High Risk",value:highRisk}]} dataKey="value" nameKey="name" innerRadius={67} outerRadius={88} paddingAngle={4} stroke="none" cornerRadius={5}><Cell fill="#39856b"/><Cell fill="#d77b6d"/></Pie><Tooltip formatter={(value,name)=>[`${Number(value).toLocaleString()} students · ${classifiedCount?Math.round(Number(value)/classifiedCount*100):0}%`,name]} contentStyle={{background:"var(--popover)",border:"1px solid var(--border)",borderRadius:10,color:"var(--foreground)",fontSize:12}}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{classifiedCount.toLocaleString()}</strong><span>classified</span></div></div><div className="classification-rows"><div><span><i className="legend-dot legend-safe"/>Safe</span><strong>{safeCount}<small>{classifiedCount?Math.round(safeCount/classifiedCount*100):0}%</small></strong></div><div><span><i className="legend-dot legend-risk"/>High Risk</span><strong>{highRisk}<small>{classifiedCount?Math.round(highRisk/classifiedCount*100):0}%</small></strong></div></div>{unclassifiedCount>0&&<p className="chart-footnote">{unclassifiedCount} unclassified {unclassifiedCount===1?"record is":"records are"} excluded from this donut.</p>}</>}<button className="text-link full-link" onClick={()=>{setRiskFilter("High Risk");navigate("Students")}}>Review flagged students <ArrowRight size={15}/></button></section></div>
          <section className="panel table-panel"><div className="panel-heading table-panel-heading"><div><h2>Students needing attention</h2><p>Review flags and prioritize supportive follow-up.</p></div><button className="text-link" onClick={()=>navigate("Students")}>View directory <ArrowRight size={15}/></button></div><StudentTable students={scopedStudents.filter(s=>s.prediction==="High Risk").slice(0,5)} onSelect={s=>setSelected(s)}/></section>
          <div className="bottom-grid"><section className="panel action-panel"><div className="action-icon lavender"><Target size={19}/></div><div className="action-copy"><h3>Assess a student</h3><p>Run the connected model against a single student's academic and engagement indicators.</p><button className="text-link" onClick={()=>navigate("Assessment")}>Start assessment <ArrowRight size={15}/></button></div><div className="action-illustration"><Activity size={37}/></div></section><section className="panel action-panel"><div className="action-icon mint"><Sparkles size={19}/></div><div className="action-copy"><h3>Build a support plan</h3><p>Combine academic context, skills, projects, and goals into an individualized recommendation request.</p><button className="text-link" onClick={()=>navigate("Recommendations")}>Explore recommendations <ArrowRight size={15}/></button></div><div className="action-illustration"><BookOpen size={37}/></div></section></div>
        </>}
        {view==="Students"&&<><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> STUDENT DIRECTORY</div><h1>Student records</h1><p className="page-subtitle">Search, filter, and review student indicators. Select a row to inspect the profile.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={exportStudents}><Download size={16}/> Export CSV</button><button className="button button-primary" onClick={()=>navigate("Assessment")}><Plus size={17}/> Assess student</button></div></div><div className="panel directory-panel"><div className="directory-toolbar"><select aria-label="Academic year filter" value={selectedAcademicYear} onChange={e=>{setSelectedAcademicYear(e.target.value);setSelectedSemester("All");setSelectedSection("All")}}><option value="All">All academic years</option>{academicYears.map(y=><option key={y.id} value={y.name}>{y.name}</option>)}</select><select aria-label="Semester filter" value={selectedSemester} onChange={e=>{setSelectedSemester(e.target.value);setSelectedSection("All")}}><option value="All">All semesters</option>{(academicYears.find(y=>y.name===selectedAcademicYear)?.semesters??academicYears.flatMap(y=>y.semesters)).map(sm=><option key={sm.id} value={String(sm.number)}>{sm.name}</option>)}</select><select aria-label="Section filter" value={selectedSection} onChange={e=>setSelectedSection(e.target.value)}><option value="All">All sections</option>{(academicYears.flatMap(y=>y.semesters).filter(sm=>selectedSemester==="All"||String(sm.number)===selectedSemester).flatMap(sm=>sm.sections)).map(sec=><option key={sec.id} value={sec.name}>{sec.name}</option>)}</select><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, ID, or major..."/></div><div className="filter-wrap"><Filter size={15}/><select value={riskFilter} onChange={e=>setRiskFilter(e.target.value)}><option>All students</option><option>High Risk</option><option>Safe</option><option>Attendance alert</option><option>Unclassified</option></select></div><span className="result-count">{filtered.length} records</span></div><StudentTable students={filtered} onSelect={s=>setSelected(s)}/>{filtered.length===0&&<div className="empty-state">No students match those filters.</div>}</div><p className="table-disclaimer">Attendance alerts are assessed separately from academic status.</p></>}
        {view==="Assessment"&&<><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> INDIVIDUAL ASSESSMENT</div><h1>Assess a student</h1><p className="page-subtitle">Use current academic and engagement indicators to generate a model assessment.</p></div></div><div className="assessment-layout"><form className="panel assessment-form" onSubmit={submitAssessment}><div className="form-section-title"><span className="section-number">01</span><div><h2>Student profile</h2><p>Basic details to identify this assessment.</p></div></div><div className="form-grid"><Field label="Student ID" value={form.student_id} onChange={v=>updateForm("student_id",v)} required error={assessmentErrors.student_id}/><Field label="Major / department" value={form.major} onChange={v=>updateForm("major",v)}/><Field label="Age" value={form.age} onChange={v=>updateForm("age",v)} type="number" min="0" max="120" error={assessmentErrors.age}/></div><div className="form-divider"/><div className="form-section-title"><span className="section-number">02</span><div><h2>Academic indicators</h2><p>Use the latest available academic values. Required fields are marked.</p></div></div><div className="form-grid"><Field label="CGPA (0–10)" value={form.GPA} onChange={v=>updateForm("GPA",v)} type="number" min="0" max="10" step=".1" required error={assessmentErrors.GPA}/><Field label="Average course grade (0–100)" value={form.grade} onChange={v=>updateForm("grade",v)} type="number" min="0" max="100" step="1" error={assessmentErrors.grade}/><div className="field"><label htmlFor="assessment-attendance">Attendance rate <strong>{form.attendance}%</strong></label><input id="assessment-attendance" type="range" min="0" max="100" value={form.attendance} aria-describedby={assessmentErrors.attendance?"assessment-attendance-error":undefined} aria-invalid={Boolean(assessmentErrors.attendance)} onChange={e=>updateForm("attendance",e.target.value)} className="range-input"/>{assessmentErrors.attendance&&<span id="assessment-attendance-error" className="field-error" role="alert">{assessmentErrors.attendance}</span>}<div className="range-labels"><span>0%</span><span>100%</span></div></div><Field label="Assignment submission (%)" value={form.assignments} onChange={v=>updateForm("assignments",v)} type="number" min="0" max="100" error={assessmentErrors.assignments}/><Field label="Video completion (%)" value={form.video} onChange={v=>updateForm("video",v)} type="number" min="0" max="100" error={assessmentErrors.video}/></div><div className="form-divider"/><div className="form-section-title"><span className="section-number">03</span><div><h2>Learning engagement</h2><p>Optional activity measures add context when available.</p></div></div><div className="form-grid"><Field label="LMS logins in past month" value={form.logins} onChange={v=>updateForm("logins",v)} type="number" min="0" error={assessmentErrors.logins}/><Field label="Average session (minutes)" value={form.duration} onChange={v=>updateForm("duration",v)} type="number" min="0" error={assessmentErrors.duration}/><Field label="Forum participation count" value={form.forums} onChange={v=>updateForm("forums",v)} type="number" min="0" error={assessmentErrors.forums}/></div><div className="form-actions"><span><ShieldCheck size={15}/> Only fields supported by the current model are submitted.</span><button className="button button-primary" type="submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<Zap size={16}/>} {busy?"Assessing…":"Run assessment"}</button></div></form><div className="result-column">{busy?<div className="panel result-empty result-loading" role="status" aria-live="polite"><LoaderCircle className="spin" size={25}/><h3>Assessing student data</h3><p>The connected model is evaluating the submitted indicators.</p></div>:prediction?<div className="panel result-card"><div className="result-topline"><span className="result-check"><Check size={16}/></span><span>ASSESSMENT RESULT</span></div><div className={`prediction-pill ${prediction.prediction==="High Risk"?"pill-risk":"pill-safe"}`}>{prediction.prediction==="High Risk"?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>} {prediction.prediction}</div><h2>{prediction.prediction==="High Risk"?"Support review recommended":"No risk flag from current model"}</h2><p className="result-description">{prediction.prediction==="High Risk"?"Review the student's academic context and consider timely, supportive outreach.":"Continue routine monitoring and encourage consistent learning habits."}</p><div className="probability-list"><Probability label="High Risk" value={prediction.class_probabilities?.["High Risk"]??0} color="risk"/><Probability label="Safe" value={prediction.class_probabilities?.Safe??0} color="safe"/></div><div className={`attendance-result ${prediction.attendance_alert?"alert-on":"alert-off"}`}>{prediction.attendance_alert?<AlertTriangle size={17}/>:<CheckCircle2 size={17}/>}<div><strong>{prediction.attendance_alert?"Attendance alert triggered":"No attendance alert"}</strong><span>{prediction.attendance_alert?"Attendance is at or below the 65% alert threshold.":"Attendance is above the 65% alert threshold."}</span></div></div><div className="result-note">Academic classification and attendance alert are assessed separately.</div><button className="button button-primary result-plan-action" type="button" onClick={()=>{void requestRecommendations()}} disabled={recommendationLoading}><Sparkles size={15}/> Open personalized plan</button></div>:<div className="panel result-empty"><div className="empty-orbit"><BrainCircuit size={28}/></div><h3>Your assessment appears here</h3><p>Complete the form and run the model to see the classification, class probabilities, and separate attendance alert.</p><div className="empty-feature"><CheckCircle2 size={16}/> Model prediction</div><div className="empty-feature"><CheckCircle2 size={16}/> Class probability breakdown</div><div className="empty-feature"><CheckCircle2 size={16}/> Attendance threshold alert</div><div className="empty-tip"><CircleHelp size={16}/><span>Ensure the FastAPI backend is running at <code>{API_BASE}</code>.</span></div></div>}<div className="mini-note"><ShieldCheck size={16}/><span><strong>Use responsibly.</strong> Model output is one signal for human review, not a decision about a student.</span></div></div></div></>}
        {view==="Batch import"&&<><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> BATCH ASSESSMENT</div><h1>Import student data</h1><p className="page-subtitle">Upload a CSV, preview the data, run batch prediction, and export the results.</p></div></div><div className="import-layout"><div className="panel import-main">{!csvFile?<div className={`dropzone ${dragging?"dropzone-active":""}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);handleCsv(e.dataTransfer.files[0])}}><div className="upload-icon"><UploadCloud size={25}/></div><h2>Choose a student CSV</h2><p>Import records for batch assessment and save the results to your student records.</p><button className="button button-primary" type="button" onClick={()=>fileRef.current?.click()}><FileSpreadsheet size={16}/> Choose CSV file</button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e=>handleCsv(e.target.files?.[0])}/><span className="file-hint">CSV only · Up to 500 records per API request</span></div>:<div className="file-selected"><div className="file-icon"><FileSpreadsheet size={19}/></div><div className="file-info"><strong>{csvName}</strong><span>{csvFile.size<1024*1024?`${(csvFile.size/1024).toFixed(1)} KB`:`${(csvFile.size/1024/1024).toFixed(1)} MB`} · {csvError?"Needs attention":`${csvRows.length} rows detected`}</span></div><button className="button button-secondary" type="button" onClick={()=>fileRef.current?.click()}>Replace</button><button className="icon-button" type="button" onClick={clearCsv} aria-label="Remove file"><X size={17}/></button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e=>{handleCsv(e.target.files?.[0]);e.currentTarget.value=""}}/></div>}{csvError&&<p className="csv-error" role="alert">{csvError}</p>}<details className="csv-help"><summary>CSV format and supported columns</summary><p>Use fields such as student_id, GPA (0–10), attendance_rate (fraction or percent), avg_course_grade, assignment_submission_rate, video_completion_rate, and major. The importer also accepts common aliases and defaults missing optional fields.</p></details><div className="import-steps"><div className="step active"><span>1</span><div><strong>Upload</strong><small>Choose CSV file</small></div></div><div className="step-line"/><div className={`step ${csvRows.length?"active":""}`}><span>2</span><div><strong>Preview</strong><small>Check columns</small></div></div><div className="step-line"/><div className={`step ${batchResults.length?"active":""}`}><span>3</span><div><strong>Assess</strong><small>Run model</small></div></div></div>{csvRows.length>0&&<><div className="academic-upload-fields"><label>Default academic year<select value={uploadAcademicYear} onChange={e=>setUploadAcademicYear(e.target.value)}><option value="">Use CSV column / not specified</option>{academicYears.map(y=><option key={y.id} value={y.name}>{y.name}</option>)}</select></label><label>Default semester<select value={uploadSemester} onChange={e=>setUploadSemester(e.target.value)}><option value="">Use CSV column / not specified</option>{academicYears.flatMap(y=>y.semesters).map(sm=><option key={sm.id} value={String(sm.number)}>{sm.name}</option>)}</select></label><label>Default section<select value={uploadSection} onChange={e=>setUploadSection(e.target.value)}><option value="">Use CSV column / not specified</option>{academicYears.flatMap(y=>y.semesters).flatMap(sm=>sm.sections).map(sec=><option key={sec.id} value={sec.name}>{sec.name}</option>)}</select></label></div><div className="preview-heading"><div><h3>Data preview</h3><p>First 5 records · input rates may be fractions or percentages.</p></div><button className="button button-primary" onClick={runBatch} disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<Zap size={16}/>} {busy?"Processing…":"Run batch assessment"}</button></div><div className="preview-table-wrap"><table className="preview-table"><thead><tr>{Object.keys(csvRows[0]).slice(0,7).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{csvRows.slice(0,5).map((row,i)=><tr key={i}>{Object.keys(csvRows[0]).slice(0,7).map(k=><td key={k}>{String(row[k]??"—")}</td>)}</tr>)}</tbody></table></div></>}{batchResults.length>0&&<div className="batch-summary"><div><CheckCircle2 size={20}/><div><strong>{batchResults.length} assessments completed</strong><span>{batchResults.filter(r=>r.prediction==="High Risk").length} flagged high risk · {batchResults.filter(r=>r.attendance_alert).length} attendance alerts</span></div></div><div className="batch-actions"><button className="button button-secondary" onClick={downloadBatch}><Download size={15}/> Download results</button><button className="button button-secondary" onClick={clearCsv}>Import another file</button></div></div>}</div><aside className="panel import-guide"><div className="guide-icon"><BookOpen size={19}/></div><h3>Import guide</h3><p>Review supported headers only when you need them.</p><details><summary>Expected CSV fields</summary><div className="schema-list">{[["GPA","Required · 0–10"],["attendance_rate","Required · 0–1 or %"],["student_id","Optional identifier"],["avg_course_grade","0–100"],["assignment_submission_rate","0–1 or %"],["video_completion_rate","0–1 or %"],["major","Department / program"]].map(([a,b])=><div key={a}><code>{a}</code><span>{b}</span></div>)}</div></details><div className="guide-warning"><AlertTriangle size={16}/><span>Upload only data approved for your student support workflow.</span></div><button className="text-link" onClick={()=>{const csv="student_id,GPA,attendance_rate,avg_course_grade,assignment_submission_rate,video_completion_rate,major\\nDEMO-001,7.2,0.82,74,0.80,0.75,Computer Science\\nDEMO-002,5.1,0.59,52,0.62,0.48,Information Technology";const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="edupredict-template.csv";a.click();URL.revokeObjectURL(url)}}><Download size={15}/> Download sample template</button></aside></div></>}
        {view==="Recommendations"&&<><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> PERSONALIZED SUPPORT</div><h1>{recommendationMeta?.prediction==="High Risk"?"Recovery plan":recommendationMeta?.prediction==="Safe"?"Growth plan":"Build a student support plan"}</h1><p className="page-subtitle">Use verified student context to guide focused support and measurable next steps.</p></div><div className="api-chip"><Sparkles size={15}/> Generated from current assessment</div></div><div className="recommend-layout"><form className="panel assessment-form" onSubmit={e=>{e.preventDefault();void requestRecommendations()}}><div className="form-section-title"><span className="section-number">01</span><div><h2>Student context</h2><p>Provide interests and goals so advice isn't inferred from CGPA alone.</p></div></div><div className="form-grid"><Field label="Student ID" value={form.student_id} onChange={v=>updateForm("student_id",v)}/><Field label="Major / department" value={form.major} onChange={v=>updateForm("major",v)}/><Field label="CGPA (0–10)" value={form.GPA} onChange={v=>updateForm("GPA",v)} type="number" min="0" max="10"/><Field label="Attendance (%)" value={form.attendance} onChange={v=>updateForm("attendance",v)} type="number" min="0" max="100"/><Field label="Average grade (0–100)" value={form.grade} onChange={v=>updateForm("grade",v)} type="number" min="0" max="100"/></div><div className="form-divider"/><div className="form-section-title"><span className="section-number">02</span><div><h2>Skills and direction</h2><p>Use real student-reported details to tailor the plan.</p></div></div><div className="field"><label>Current technical skills</label><textarea value={form.skills} onChange={e=>updateForm("skills",e.target.value)} placeholder="e.g. Python, SQL, React"/></div><div className="field"><label>Interests</label><textarea value={form.interests} onChange={e=>updateForm("interests",e.target.value)} placeholder="Topics or domains the student enjoys"/></div><div className="field"><label>Projects / practical experience</label><textarea value={form.projects} onChange={e=>updateForm("projects",e.target.value)} placeholder="Projects, labs, internships, or experience"/></div><div className="field"><label>Academic or career goal</label><textarea value={form.goal} onChange={e=>updateForm("goal",e.target.value)} placeholder="e.g. pass calculus, build portfolio, prepare for internship"/></div><div className="form-actions"><span><ShieldCheck size={15}/> Provider keys must stay on the backend.</span><button className="button button-primary" type="submit" disabled={recommendationLoading}>{recommendationLoading?<LoaderCircle className="spin" size={16}/>:<Sparkles size={16}/>} Generate support plan</button><button className="button button-secondary" type="button" onClick={()=>void loadRecommendationHistory()} disabled={historyLoading}>{historyLoading?<LoaderCircle className="spin" size={16}/>:<BookOpen size={16}/>} Saved plans</button></div></form><div className="recommend-side"><div className="panel recommendation-output"><div className="output-heading"><div className="action-icon lavender"><Sparkles size={18}/></div><div><h2>Personalized action plan</h2><p>Generated from student context</p></div></div>{recommendation?<><div className="plan-status"><span className={`status-pill ${recommendationMeta?.prediction==="High Risk"?"risk":"safe"}`}><i/>{recommendationMeta?.prediction}</span><strong>{recommendationMeta?.prediction==="High Risk"?"Recovery Plan":"Growth Plan"}</strong>{recommendationMeta?.createdAt&&<small>{recommendationMeta.createdAt}</small>}</div>{recommendMetaFallback(recommendationMeta)}<RecommendationContent text={recommendation} /></>:recommendationLoading?<div className="output-placeholder"><LoaderCircle className="spin" size={22}/><h3>Building a tailored plan…</h3><p>Reviewing the current assessment and student-provided context.</p></div>:<div className="output-placeholder"><div className="empty-orbit"><Sparkles size={26}/></div><h3>Useful advice starts with context</h3><p>Add skills, interests, practical experience, and a goal, then request a plan from your backend recommendation service.</p><div className="recommend-item"><span className="recommend-number">01</span><div><strong>Academic action plan</strong><span>Specific study habits and learning milestones</span></div></div><div className="recommend-item"><span className="recommend-number">02</span><div><strong>Technical skill roadmap</strong><span>Matched to current skill level and interests</span></div></div><div className="recommend-item"><span className="recommend-number">03</span><div><strong>Project & career readiness</strong><span>Portfolio ideas and realistic next steps</span></div></div></div>}</div>{recommendationHistory.length>0&&<div className="panel saved-plans"><h3>Saved plans · {form.student_id}</h3>{recommendationHistory.map(item=><button className="saved-plan-row" key={item.id} onClick={()=>{setRecommendation(item.recommendation);setRecommendationMeta({prediction:item.academic_prediction==="High Risk"?"High Risk":"Safe",attendanceAlert:item.attendance_alert,createdAt:item.created_at})}}><span><strong>{item.academic_prediction}</strong><small>{item.created_at?new Date(item.created_at).toLocaleString():"Saved recommendation"}</small></span><span>{item.attendance_alert?"Attendance alert":"No attendance alert"} <ArrowRight size={14}/></span></button>)}</div>}<div className="mini-note"><ShieldCheck size={16}/><span>Recommendations are guidance, not guarantees. Review for relevance, accessibility, and fairness before sharing.</span></div></div></div></>}
      </div>
      <footer className="app-footer"><span>© 2026 EduPredict AI <i/> Student support workspace</span><span><span className="footer-status"/> Student support workspace</span></footer>
    </main>
    {academicDialog&&<div className="modal-scrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setAcademicDialog(null)}}><section className="academic-modal" role="dialog" aria-modal="true" aria-labelledby="academic-modal-title"><div className="academic-modal-header"><div className="academic-modal-icon"><GraduationCap size={20}/></div><div><span>ACADEMIC WORKSPACE</span><h2 id="academic-modal-title">{academicDialog.type==="academic_year"?"Create academic year":academicDialog.type==="semester"?"Add semester":"Add section"}</h2><p>{academicDialog.type==="academic_year"?"Create a batch to organize your student records.":academicDialog.type==="semester"?`Add a semester under ${academicDialog.parentLabel??"this academic year"}.`:`Add a section under ${academicDialog.parentLabel??"this semester"}.`}</p></div><button className="icon-button" type="button" onClick={()=>setAcademicDialog(null)} aria-label="Close"><X size={18}/></button></div><div className="academic-modal-body"><label htmlFor="academic-name">{academicDialog.type==="academic_year"?"Academic year / batch name":academicDialog.type==="semester"?"Semester display name":"Section name"}</label><input id="academic-name" autoFocus value={academicName} onChange={e=>setAcademicName(e.target.value)} placeholder={academicDialog.type==="academic_year"?"e.g. 2025–2029":academicDialog.type==="semester"?"e.g. 7th Semester":"e.g. Section A"} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void createAcademicItem()}}}/>{academicDialog.type==="semester"&&<><label htmlFor="semester-number">Semester number</label><select id="semester-number" value={academicNumber} onChange={e=>setAcademicNumber(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i+1} value={String(i+1)}>Semester {i+1}</option>)}</select></>}<p className="academic-modal-hint"><ShieldCheck size={14}/> Students and existing assessments will not be deleted.</p></div><div className="academic-modal-actions"><button className="button button-secondary" type="button" onClick={()=>setAcademicDialog(null)}>Cancel</button><button className="button button-primary" type="button" onClick={()=>void createAcademicItem()} disabled={academicSaving||!academicName.trim()}>{academicSaving?<LoaderCircle className="spin" size={15}/>:<Plus size={15}/>} {academicSaving?"Creating…":"Create"}</button></div></section></div>}
    {selected&&<div className="modal-scrim" onClick={()=>setSelected(null)}><section className="student-modal" onClick={e=>e.stopPropagation()}><div className="modal-top"><div className="modal-avatar">{initials(selected.name)}</div><button className="icon-button" onClick={()=>setSelected(null)} aria-label="Close profile"><X size={18}/></button></div><h2>{selected.name}</h2><p className="modal-subtitle">{selected.student_id} · {selected.major}</p><div className={`prediction-pill ${selected.prediction==="High Risk"?"pill-risk":selected.prediction==="Safe"?"pill-safe":"pill-neutral"}`}>{selected.prediction==="High Risk"?<AlertTriangle size={16}/>:selected.prediction==="Safe"?<CheckCircle2 size={16}/>:<CircleHelp size={16}/>} {selected.prediction}</div><div className="profile-stat-grid"><div><span>CGPA</span><strong>{selected.GPA.toFixed(1)}<small>/10</small></strong></div><div><span>Attendance</span><strong>{percent(selected.attendance_rate)}</strong></div><div><span>Course grade</span><strong>{selected.avg_course_grade}<small>/100</small></strong></div><div><span>Assignments</span><strong>{percent(selected.assignment_submission_rate)}</strong></div></div><div className={`attendance-result ${selected.attendance_alert?"alert-on":"alert-off"}`}>{selected.attendance_alert?<AlertTriangle size={17}/>:<CheckCircle2 size={17}/>}<div><strong>{selected.attendance_alert?"Attendance alert triggered":"No attendance alert"}</strong><span>Independent threshold: attendance at or below 65%.</span></div></div><div className="modal-actions"><button className="button button-secondary" onClick={()=>{setForm(f=>({...f,student_id:selected.student_id,GPA:String(selected.GPA),attendance:String(Math.round(selected.attendance_rate*100)),grade:String(selected.avg_course_grade),major:selected.major,assignments:String(Math.round(selected.assignment_submission_rate*100)),video:String(Math.round(selected.video_completion_rate*100))}));setSelected(null);navigate("Assessment")}}>Run new assessment <ArrowRight size={15}/></button><button className="button button-primary" disabled={recommendationLoading} onClick={()=>{const student=selected;setForm(f=>({...f,student_id:student.student_id,GPA:String(student.GPA),attendance:String(Math.round(student.attendance_rate*100)),grade:String(student.avg_course_grade),major:student.major,assignments:String(Math.round(student.assignment_submission_rate*100)),video:String(Math.round(student.video_completion_rate*100))}));setSelected(null);void requestRecommendations(student)}}><Sparkles size={15}/> {recommendationLoading?"Generating…":"Generate AI suggestions"}</button></div></section></div>}
    {toast&&<div className="toast-message" role="status"><CheckCircle2 size={17}/><span>{toast}</span><button onClick={()=>setToast("")} aria-label="Dismiss"><X size={15}/></button></div>}
  </div>
}

function Metric({icon,label,value,trend,tone,foot}:{icon:ReactNode;label:string;value:string;trend:string;tone:string;foot:string}) {
  return <div className="metric-card"><div className="metric-top"><div className={`metric-icon ${tone}`}>{icon}</div><button className="metric-menu" aria-label={`${label} details`} title={foot}><MoreHorizontal size={18}/></button></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-bottom"><span className={`metric-trend ${tone}`}>{trend}</span><span className="metric-foot">{foot}</span></div></div>
}
function StudentTable({students,onSelect}:{students:Student[];onSelect:(s:Student)=>void}) {
  return <div className="student-table-wrap"><table className="student-table"><thead><tr><th>STUDENT</th><th>CGPA</th><th>ATTENDANCE</th><th>COURSE GRADE</th><th>ML PREDICTION</th><th>ATTENDANCE ALERT</th><th/></tr></thead><tbody>{students.map(s=><tr key={s.student_id} onClick={()=>onSelect(s)} tabIndex={0} onKeyDown={e=>{if(e.key==="Enter")onSelect(s)}}><td><div className="student-identity"><div className={`student-avatar avatar-${s.prediction==="High Risk"?"risk":s.prediction==="Safe"?"safe":"unclassified"}`}>{initials(s.name)}</div><div><strong>{s.name}</strong><span>{s.student_id} · {s.major}</span></div></div></td><td><strong className="numeric">{s.GPA.toFixed(1)}</strong><span className="cell-muted">/ 10</span></td><td><div className="attendance-cell"><div className="mini-progress"><span className={s.attendance_rate<=.65?"progress-risk":""} style={{width:`${Math.min(100,s.attendance_rate*100)}%`}}/></div><span>{percent(s.attendance_rate)}</span></div></td><td><strong className="numeric">{s.avg_course_grade}</strong><span className="cell-muted">/ 100</span></td><td><span className={`status-pill ${s.prediction==="High Risk"?"risk":s.prediction==="Safe"?"safe":"unclassified"}`}><i/>{s.prediction}</span></td><td>{s.attendance_alert?<span className="alert-label"><AlertTriangle size={14}/> Alert</span>:<span className="no-alert"><CheckCircle2 size={14}/> None</span>}</td><td><button className="row-arrow" aria-label={`View ${s.name}`} onClick={e=>{e.stopPropagation();onSelect(s)}}><ArrowRight size={16}/></button></td></tr>)}</tbody></table></div>
}
function Field({label,value,onChange,type="text",min,max,step,required,error,hint}:{label:string;value:string;onChange:(v:string)=>void;type?:string;min?:string;max?:string;step?:string;required?:boolean;error?:string;hint?:string}) {
  const id=`field-${label.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`
  return <div className={`field ${error?"field-invalid":""}`}><label htmlFor={id}>{label}{required&&<span className="required-mark">Required</span>}</label><input id={id} type={type} min={min} max={max} step={step} value={value} required={required} aria-invalid={Boolean(error)} aria-describedby={error?`${id}-error`:hint?`${id}-hint`:undefined} onChange={e=>onChange(e.target.value)}/>{error?<span className="field-error" id={`${id}-error`} role="alert">{error}</span>:hint?<span className="field-hint" id={`${id}-hint`}>{hint}</span>:null}</div>
}
function Probability({label,value,color}:{label:string;value:number;color:string}) {
  return <div className="probability-row"><div><span>{label}</span><strong>{Math.round(value*100)}%</strong></div><div className="probability-track"><span className={`probability-fill ${color}`} style={{width:`${Math.max(0,Math.min(100,value*100))}%`}}/></div></div>
}
export default App
