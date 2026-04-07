import data from '../content/data.json';

/** School level key */
type SchoolLevel = '초등학교' | '중학교' | '고등학교';

/** Subject area key */
type SubjectArea = '수와 연산' | '변화와 관계' | '도형과 측정' | '자료와 가능성';

/** Topic group with prerequisites and curriculum items */
type TopicGroup = {
  id: string;
  requirements: string[];
  curriculum: string[];
};

/** Full curriculum tree structure */
type CurriculumTree = Record<
  SchoolLevel,
  Record<SubjectArea, Record<string, TopicGroup[]>>
>;

/** User-selected curriculum topic */
type SelectedTopic = {
  level: SchoolLevel;
  subject: SubjectArea;
  grade: string;
  group: TopicGroup;
  item: string;
};

/** Typed curriculum data imported from JSON */
const curriculum = data as CurriculumTree;

/** All subject area keys */
const SUBJECT_AREAS: SubjectArea[] = [
  '수와 연산',
  '변화와 관계',
  '도형과 측정',
  '자료와 가능성',
];

/**
 * Get available grades that have at least one topic group.
 * @param level school level
 * @param subject subject area
 * @return non-empty grade keys
 */
function getGrades(level: SchoolLevel, subject: SubjectArea): string[] {
  const grades = curriculum[level][subject];
  return Object.keys(grades).filter(
    (g) => (grades[g] as TopicGroup[]).length > 0,
  );
}

/**
 * Get topic groups for a given level, subject, and grade.
 * @param level school level
 * @param subject subject area
 * @param grade grade key
 * @return array of topic groups
 */
function getTopicGroups(
  level: SchoolLevel,
  subject: SubjectArea,
  grade: string,
): TopicGroup[] {
  return (curriculum[level][subject][grade] as TopicGroup[]) ?? [];
}

export type {
  SchoolLevel,
  SubjectArea,
  TopicGroup,
  CurriculumTree,
  SelectedTopic,
};
export { curriculum, SUBJECT_AREAS, getGrades, getTopicGroups };
