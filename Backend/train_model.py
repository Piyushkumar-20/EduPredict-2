
from pathlib import Path
import argparse, json
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, classification_report, confusion_matrix, roc_auc_score
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/EduPredict_Synthetic_Benchmark_5000.csv")
    ap.add_argument("--out", default="artifacts")
    args = ap.parse_args()
    out_dir = Path(args.out); out_dir.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(args.data)
    target = "support_label"
    if target not in df:
        raise ValueError("Missing target column support_label")
    y = df[target].astype(str)
    exclude = {target, "label_source", "risk_rule_version", "student_id", "attendance_rate"}
    X = df.drop(columns=[c for c in exclude if c in df.columns])
    numeric = X.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical = [c for c in X.columns if c not in numeric]
    transformers = []
    if numeric:
        transformers.append(("num", Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler())
        ]), numeric))
    if categorical:
        transformers.append(("cat", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore"))
        ]), categorical))
    pre = ColumnTransformer(transformers=transformers)
    models = {
        "logistic_regression": LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42),
        "decision_tree": DecisionTreeClassifier(max_depth=7, min_samples_leaf=10, class_weight="balanced", random_state=42),
        "random_forest": RandomForestClassifier(n_estimators=350, min_samples_leaf=5, class_weight="balanced_subsample", random_state=42, n_jobs=-1)
    }
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=.2, random_state=42, stratify=y)
    results, fitted = [], {}
    for name, model in models.items():
        pipe = Pipeline([("preprocess", pre), ("model", model)])
        pipe.fit(X_train, y_train)
        pred = pipe.predict(X_test)
        p, r, f, _ = precision_recall_fscore_support(y_test, pred, average="macro", zero_division=0)
        m = {"model": name, "accuracy": float(accuracy_score(y_test, pred)), "macro_precision": float(p), "macro_recall": float(r), "macro_f1": float(f)}
        if hasattr(pipe, "predict_proba"):
            cls = list(pipe.classes_)
            if len(cls) == 2:
                pos = cls.index("High Risk") if "High Risk" in cls else 1
                m["roc_auc_high_risk"] = float(roc_auc_score((y_test == "High Risk").astype(int), pipe.predict_proba(X_test)[:, pos]))
        results.append(m); fitted[name] = pipe
    best = max(results, key=lambda x: x["macro_f1"])
    model = fitted[best["model"]]
    pred = model.predict(X_test)
    metrics = {
        "dataset_rows": int(len(df)), "train_rows": int(len(X_train)), "test_rows": int(len(X_test)),
        "class_counts": {str(k): int(v) for k,v in y.value_counts().items()},
        "candidate_models": results, "selected_model": best["model"],
        "classification_report": classification_report(y_test, pred, output_dict=True, zero_division=0),
        "confusion_matrix_labels_order": ["High Risk", "Safe"],
        "confusion_matrix": confusion_matrix(y_test, pred, labels=["High Risk", "Safe"]).tolist(),
        "features": list(X.columns),
        "label_rule": "Synthetic academic-only rule: very low GPA or combinations of low GPA, course grade, assignment submission and engagement; attendance is excluded from the classifier and handled by a separate alert.",
        "label_provenance": "synthetic_academic_rule_generated",
        "interpretation": "Metrics evaluate agreement with a synthetic rule-generated label, not real-world student outcomes."
    }
    joblib.dump({
        "pipeline": model, "feature_columns": list(X.columns),
        "classes": list(model.classes_),
        "label_rule": metrics["label_rule"],
        "label_provenance_warning": metrics["interpretation"],
        "gpa_scale": "10-point"
    }, out_dir / "edupredict_model.joblib")
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
if __name__ == "__main__":
    main()
