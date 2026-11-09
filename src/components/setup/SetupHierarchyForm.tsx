import type { FormEvent } from "react";
import { useT } from "../../lib/i18n";
import type { SetupHierarchyResult } from "../../hooks/useSetupHierarchy";
import type { ListState } from "../../hooks/useCampusData";

/**
 * Stateless form: सबै डाटा र callback `model` बाट आउँछ।
 * Logic र fetching `useSetupHierarchy` मा छ।
 */
export interface SetupHierarchyFormProps {
  model: SetupHierarchyResult;
}

/** सूचीको loading / error / empty अवस्था अनुसार placeholder */
function statusHint<T>(list: ListState<T>, emptyText: string, tx: (ne: string, en: string) => string): string | null {
  if (list.status === "loading") return tx("लोड हुँदैछ…", "Loading…");
  if (list.status === "error") return list.errorMessage ?? tx("लोड हुन सकेन", "Failed to load");
  if (list.status === "ready" && list.items.length === 0) return emptyText;
  return null;
}

export default function SetupHierarchyForm({ model }: SetupHierarchyFormProps) {
  const { tx, pick } = useT();
  const { values, departments, programs, classes, sections, subjects, teachers } = model;

  const hasDept = values.departmentId !== "";
  const hasProgram = values.programId !== "";
  const hasClass = values.classId !== "";
  const creatingNew = values.newSubjectName.trim().length > 0;
  const canSubmit =
    !model.submitting &&
    !!model.orgId &&
    hasDept &&
    hasClass &&
    (creatingNew || values.subjectId !== "");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await model.submit();
  };

  const label = "mb-1 block text-sm font-medium";
  const hint = "mt-1 text-xs text-slate-500";

  return (
    <form onSubmit={onSubmit} className="card grid gap-4 sm:grid-cols-2">
      {/* विभाग */}
      <div>
        <label className={label}>{tx("विभाग", "Department")}</label>
        <select
          className="field"
          value={values.departmentId}
          disabled={departments.status === "loading"}
          onChange={(e) => model.setDepartment(e.target.value)}
        >
          <option value="">{tx("छान्नुहोस्", "Select")}</option>
          {departments.items.map((d) => (
            <option key={d.id} value={d.id}>{pick(d.name, d.name_en)}</option>
          ))}
        </select>
        {statusHint(departments, tx("कुनै विभाग छैन", "No departments"), tx) && (
          <p className={hint}>{statusHint(departments, tx("कुनै विभाग छैन", "No departments"), tx)}</p>
        )}
      </div>

      {/* कार्यक्रम */}
      <div>
        <label className={label}>{tx("कार्यक्रम", "Program")}</label>
        <select
          className="field"
          value={values.programId}
          disabled={!hasDept || programs.status === "loading"}
          onChange={(e) => model.setProgram(e.target.value)}
        >
          <option value="">{tx("छान्नुहोस्", "Select")}</option>
          {programs.items.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {hasDept && statusHint(programs, tx("यस विभागमा कार्यक्रम छैन", "No programs in this department"), tx) && (
          <p className={hint}>{statusHint(programs, tx("यस विभागमा कार्यक्रम छैन", "No programs in this department"), tx)}</p>
        )}
      </div>

      {/* कक्षा */}
      <div>
        <label className={label}>{tx("कक्षा", "Class")}</label>
        <select
          className="field"
          value={values.classId}
          disabled={!hasProgram || classes.status === "loading" || !model.academicYearId}
          onChange={(e) => model.setClass(e.target.value)}
        >
          <option value="">{tx("छान्नुहोस्", "Select")}</option>
          {classes.items.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {!model.academicYearId && (
          <p className={hint}>{tx("सक्रिय शैक्षिक वर्ष छैन", "No active academic year")}</p>
        )}
        {hasProgram && model.academicYearId && statusHint(classes, tx("यस कार्यक्रममा कक्षा छैन", "No classes in this program"), tx) && (
          <p className={hint}>{statusHint(classes, tx("यस कार्यक्रममा कक्षा छैन", "No classes in this program"), tx)}</p>
        )}
      </div>

      {/* सेक्सन (वैकल्पिक) */}
      <div>
        <label className={label}>{tx("सेक्सन (वैकल्पिक)", "Section (optional)")}</label>
        <select
          className="field"
          value={values.sectionId}
          disabled={!hasClass || sections.status === "loading"}
          onChange={(e) => model.setSection(e.target.value)}
        >
          <option value="">{tx("छान्नुहोस्", "Select")}</option>
          {sections.items.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {hasClass && statusHint(sections, tx("यस कक्षामा सेक्सन छैन (वैकल्पिक)", "No sections in this class (optional)"), tx) && (
          <p className={hint}>{statusHint(sections, tx("यस कक्षामा सेक्सन छैन (वैकल्पिक)", "No sections in this class (optional)"), tx)}</p>
        )}
      </div>

      {/* विषय: मौजुदा वा नयाँ */}
      <div>
        <label className={label}>{tx("मौजुदा विषय", "Existing subject")}</label>
        <select
          className="field"
          value={values.subjectId}
          disabled={!hasDept || creatingNew || subjects.status === "loading"}
          onChange={(e) => model.setSubject(e.target.value)}
        >
          <option value="">{tx("छान्नुहोस्", "Select")}</option>
          {subjects.items.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>
          ))}
        </select>
        {hasDept && statusHint(subjects, tx("यस विभागमा विषय छैन, नयाँ बनाउनुहोस्", "No subjects yet; create a new one"), tx) && (
          <p className={hint}>{statusHint(subjects, tx("यस विभागमा विषय छैन, नयाँ बनाउनुहोस्", "No subjects yet; create a new one"), tx)}</p>
        )}
      </div>

      <div>
        <label className={label}>{tx("नयाँ विषयको नाम", "New subject name")}</label>
        <input
          className="field"
          disabled={!hasDept}
          value={values.newSubjectName}
          onChange={(e) => model.setField("newSubjectName", e.target.value)}
        />
        <input
          className="field mt-2"
          disabled={!hasDept}
          placeholder={tx("कोड (वैकल्पिक)", "Code (optional)")}
          value={values.newSubjectCode}
          onChange={(e) => model.setField("newSubjectCode", e.target.value)}
        />
      </div>

      {/* शिक्षक */}
      <div>
        <label className={label}>{tx("शिक्षक (वैकल्पिक)", "Teacher (optional)")}</label>
        <select
          className="field"
          value={values.teacherId}
          disabled={!hasDept || teachers.status === "loading"}
          onChange={(e) => model.setField("teacherId", e.target.value)}
        >
          <option value="">{tx("पछि तोक्नुहोस्", "Assign later")}</option>
          {teachers.items.map((t) => (
            <option key={t.user_id} value={t.user_id}>{t.full_name}</option>
          ))}
        </select>
        {hasDept && statusHint(teachers, tx("यस विभागमा शिक्षक छैन", "No teachers in this department"), tx) && (
          <p className={hint}>{statusHint(teachers, tx("यस विभागमा शिक्षक छैन", "No teachers in this department"), tx)}</p>
        )}
      </div>

      <div>
        <label className={label}>{tx("कुल LH", "Total LH")}</label>
        <input
          className="field"
          type="number"
          min={0}
          disabled={!hasClass}
          value={values.totalLh}
          onChange={(e) => model.setField("totalLh", Number(e.target.value))}
        />
      </div>

      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn" disabled={!canSubmit}>
          {model.submitting ? tx("सेभ हुँदैछ…", "Saving…") : tx("विषय थप्नुहोस्", "Add subject")}
        </button>
        {!canSubmit && !model.submitting && (
          <span className="text-xs text-slate-500">
            {tx("विभाग, कक्षा र विषय छनोट गर्नुहोस्", "Select department, class and subject")}
          </span>
        )}
      </div>
    </form>
  );
}
