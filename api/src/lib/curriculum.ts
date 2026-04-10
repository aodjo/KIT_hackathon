import curriculumData from '../content/curriculum.json';

type SchoolLevel = '초등학교' | '중학교' | '고등학교';
type SubjectArea = '수와 연산' | '변화와 관계' | '도형과 측정' | '자료와 가능성';

type TopicGroup = {
  id: string;
  requirements: string[];
  curriculum: string[];
};

type CurriculumTree = Record<
  SchoolLevel,
  Record<SubjectArea, Record<string, TopicGroup[]>>
>;

type CurriculumConcept = {
  id: string;
  schoolLevel: SchoolLevel;
  subject: SubjectArea;
  grade: string;
  requirements: string[];
  curriculum: string[];
};

const curriculum = curriculumData as CurriculumTree;
const conceptMap = new Map<string, CurriculumConcept>();

for (const [schoolLevel, subjectTree] of Object.entries(curriculum) as [SchoolLevel, CurriculumTree[SchoolLevel]][]) {
  for (const [subject, gradeTree] of Object.entries(subjectTree) as [SubjectArea, CurriculumTree[SchoolLevel][SubjectArea]][]) {
    for (const [grade, groups] of Object.entries(gradeTree)) {
      for (const group of groups) {
        conceptMap.set(group.id, {
          id: group.id,
          schoolLevel,
          subject,
          grade,
          requirements: group.requirements,
          curriculum: group.curriculum,
        });
      }
    }
  }
}

/**
 * Get curriculum concept metadata by ID.
 *
 * @param conceptId target concept ID
 * @return concept metadata or null
 */
function getCurriculumConcept(conceptId?: string | null): CurriculumConcept | null {
  if (!conceptId) return null;
  return conceptMap.get(conceptId) ?? null;
}

/**
 * Get the prerequisite lineage for a concept from earliest ancestor to self.
 *
 * @param conceptId target concept ID
 * @return unique concept path
 */
function getCurriculumConceptLineage(conceptId?: string | null): CurriculumConcept[] {
  const lineage: CurriculumConcept[] = [];
  const visited = new Set<string>();

  const visit = (id?: string | null) => {
    if (!id || visited.has(id)) return;
    const concept = conceptMap.get(id);
    if (!concept) return;

    visited.add(id);
    for (const requirement of concept.requirements) visit(requirement);
    lineage.push(concept);
  };

  visit(conceptId);
  return lineage;
}

/**
 * Render a concept into a compact teacher-facing label.
 *
 * @param concept concept metadata
 * @return label string
 */
function formatCurriculumConceptLabel(concept: Pick<CurriculumConcept, 'id' | 'schoolLevel' | 'grade' | 'curriculum'>): string {
  return `${concept.id} · ${concept.schoolLevel} ${concept.grade} · ${concept.curriculum.join(', ')}`;
}

export type { CurriculumConcept };
export {
  formatCurriculumConceptLabel,
  getCurriculumConcept,
  getCurriculumConceptLineage,
};
