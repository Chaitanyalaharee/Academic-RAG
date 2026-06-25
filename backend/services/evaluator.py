"""
AcademicRAG — Evaluator
Calculates ROUGE-1, ROUGE-L, and BERTScore for model answers.
"""
import traceback
from typing import Dict

from rouge_score import rouge_scorer
from bert_score import score as bert_score_fn

from logger import app_logger, error_logger


def calculate_scores(
    predicted: str,
    ground_truth: str,
) -> Dict[str, float]:
    """
    Calculate evaluation metrics for one predicted answer.

    Args:
        predicted:    The model-generated answer.
        ground_truth: The reference/expected answer.

    Returns:
        Dict with keys: rouge1, rougeL, bertscore

    Raises:
        ValueError: if either input is empty.
        RuntimeError: if BERTScore calculation fails.
    """
    if not predicted or not predicted.strip():
        raise ValueError("Predicted answer is empty")
    if not ground_truth or not ground_truth.strip():
        raise ValueError("Ground truth answer is empty")

    try:
        scorer = rouge_scorer.RougeScorer(["rouge1", "rougeL"], use_stemmer=True)
        rouge_result = scorer.score(ground_truth, predicted)
        rouge1 = float(rouge_result["rouge1"].fmeasure)
        rougeL = float(rouge_result["rougeL"].fmeasure)
    except Exception as e:
        error_logger.error(
            "ROUGE calculation failed: %s\n%s", e, traceback.format_exc()
        )
        rouge1 = 0.0
        rougeL = 0.0

    try:
        P, R, F1 = bert_score_fn(
            [predicted],
            [ground_truth],
            model_type="distilbert-base-uncased",
            lang="en",
            verbose=False,
        )
        bertscore = float(F1[0])
    except Exception as e:
        error_logger.error(
            "BERTScore calculation failed: %s\n%s", e, traceback.format_exc()
        )
        raise RuntimeError("BERTScore calculation failed") from e

    result = {
        "rouge1":    round(rouge1, 4),
        "rougeL":    round(rougeL, 4),
        "bertscore": round(bertscore, 4),
    }
    app_logger.info(
        "Scores: ROUGE-1=%.4f, ROUGE-L=%.4f, BERTScore=%.4f",
        rouge1, rougeL, bertscore,
    )
    return result


def evaluate_all_models(
    predictions: Dict[str, str],
    ground_truth: str,
) -> Dict[str, Dict[str, float]]:
    """
    Evaluate predictions from all three models.

    Args:
        predictions:  {"minilm": answer, "e5": answer, "bge": answer}
        ground_truth: The reference answer.

    Returns:
        {"minilm": {rouge1, rougeL, bertscore}, ...}
        Model with highest BERTScore gets win=True added.
    """
    if not ground_truth or not ground_truth.strip():
        raise ValueError("Ground truth answer is empty")

    results: Dict[str, Dict] = {}
    for model_key, predicted in predictions.items():
        try:
            scores = calculate_scores(predicted, ground_truth)
            results[model_key] = scores
        except Exception as e:
            error_logger.error(
                "Evaluation failed for model '%s': %s\n%s",
                model_key, e, traceback.format_exc()
            )
            results[model_key] = {
                "rouge1":    0.0,
                "rougeL":    0.0,
                "bertscore": 0.0,
                "error":     str(e),
            }

    # Determine winner by BERTScore
    if results:
        best_model = max(results, key=lambda k: results[k].get("bertscore", 0.0))
        for k in results:
            results[k]["win"] = (k == best_model)

    return results
