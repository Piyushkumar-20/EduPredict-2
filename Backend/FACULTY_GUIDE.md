# EduPredict AI — Faculty Benchmark Notes

## Purpose
A 5,000-row synthetic dataset is provided to develop and demonstrate the ML pipeline before institutional data becomes available.

## Rule used for synthetic labels
High Risk if CGPA <= 5.5/10 OR attendance <= 65%; otherwise Safe.
This is an illustrative threshold, not a claim about the college's official policy.

## Recommended real college data later
Pseudonymous student ID, semester/year, programme, CGPA with scale, attendance percentage and time period, course load, average marks, assignment submission rate, engagement metrics if consistently available, and a faculty-reviewed label or documented rule.

## Interpretation
Because labels were generated using a known rule, model scores indicate how well the classifier approximates that rule. They do not prove that it predicts genuine academic outcomes. Validate thresholds with faculty and evaluate against independently reviewed labels before using it for student decisions.
