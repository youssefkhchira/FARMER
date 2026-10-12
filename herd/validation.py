from datetime import date
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from .models import Animal, FarmEvent, HealthRecord


def _text(value, field, limit, *, required=False):
    if not isinstance(value, str):
        raise ValidationError({field: "Must be text."})
    value = value.strip()
    if required and not value:
        raise ValidationError({field: "This field is required."})
    if len(value) > limit:
        raise ValidationError({field: f"Must be at most {limit} characters."})
    return value


def _date(value, field, *, optional=False):
    if optional and value in ("", None):
        return None
    if not isinstance(value, str):
        raise ValidationError({field: "Use an ISO date (YYYY-MM-DD)."})
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError({field: "Use an ISO date (YYYY-MM-DD)."}) from exc


def _choice(value, field, choices):
    options = {key for key, _label in choices}
    if not isinstance(value, str) or value not in options:
        raise ValidationError({field: "Select a valid option."})
    return value


def _bool(value, field):
    if not isinstance(value, bool):
        raise ValidationError({field: "Must be true or false."})
    return value


def validate_account(payload, *, registering):
    if not isinstance(payload, dict):
        raise ValidationError("Expected a JSON object.")
    try:
        email = _text(payload.get("email", ""), "email", 150, required=True).lower()
        validate_email(email)
        password = payload.get("password")
        if not isinstance(password, str) or not password:
            raise ValidationError({"password": "This field is required."})
        account = {"email": email, "password": password}
        if registering:
            account["name"] = _text(payload.get("name", ""), "name", 150, required=True)
            account["farm"] = _text(payload.get("farm", ""), "farm", 120, required=True)
        return account
    except ValidationError as exc:
        raise exc


def validate_profile(payload):
    if not isinstance(payload, dict):
        raise ValidationError("Expected a JSON object.")
    return {
        "name": _text(payload.get("name", ""), "name", 150, required=True),
        "farm": _text(payload.get("farm", ""), "farm", 120, required=True),
    }


def validate_farm_data(payload):
    if not isinstance(payload, dict):
        raise ValidationError("Expected a JSON object.")
    for key in ("animals", "events", "health"):
        if not isinstance(payload.get(key), list):
            raise ValidationError({key: "Must be a list."})

    animals, animal_ids, tags = [], set(), set()
    for entry in payload["animals"]:
        if not isinstance(entry, dict):
            raise ValidationError({"animals": "Every animal must be an object."})
        external_id = _text(entry.get("id", ""), "id", 64, required=True)
        tag = _text(entry.get("tag", ""), "tag", 40, required=True).upper()
        if external_id in animal_ids or tag in tags:
            raise ValidationError({"animals": "Animal IDs and tags must be unique."})
        animal_ids.add(external_id)
        tags.add(tag)
        weight_value = entry.get("weight", "")
        try:
            weight = None if weight_value in ("", None) else Decimal(str(weight_value))
        except (InvalidOperation, ValueError) as exc:
            raise ValidationError({"weight": "Enter a valid weight."}) from exc
        if weight is not None and (not weight.is_finite() or weight < 0 or weight > Decimal("999999.99")):
            raise ValidationError({"weight": "Weight must be between 0 and 999999.99 kg."})
        dob = _date(entry.get("dob", ""), "dob", optional=True)
        if dob and dob > date.today():
            raise ValidationError({"dob": "Date of birth cannot be in the future."})
        animals.append(
            {
                "external_id": external_id,
                "tag": tag,
                "species": _choice(entry.get("species"), "species", Animal.SPECIES),
                "name": _text(entry.get("name", ""), "name", 120),
                "sex": _choice(entry.get("sex"), "sex", Animal.SEXES),
                "breed": _text(entry.get("breed", ""), "breed", 120),
                "dob": dob,
                "weight": weight,
                "status": _choice(entry.get("status"), "status", Animal.STATUSES),
                "mother": _text(entry.get("mother", ""), "mother", 40),
                "father": _text(entry.get("father", ""), "father", 40),
                "notes": _text(entry.get("notes", ""), "notes", 10000),
                "created": _date(entry.get("created", date.today().isoformat()), "created"),
            }
        )

    events, health = [], []
    event_ids, health_ids = set(), set()
    for entry in payload["health"]:
        if not isinstance(entry, dict):
            raise ValidationError({"health": "Every health record must be an object."})
        external_id = _text(entry.get("id", ""), "id", 64, required=True)
        if external_id in health_ids:
            raise ValidationError({"health": "Health record IDs must be unique."})
        health_ids.add(external_id)
        animal_id = _text(entry.get("animalId", ""), "animalId", 64, required=True)
        if animal_id not in animal_ids:
            raise ValidationError({"animalId": "Health record refers to an unknown animal."})
        resolved = _bool(entry.get("resolved", False), "resolved")
        health.append(
            {
                "external_id": external_id,
                "animal_id": animal_id,
                "date": _date(entry.get("date"), "date"),
                "type": _choice(entry.get("type"), "type", HealthRecord.TYPES),
                "title": _text(entry.get("title", ""), "title", 200),
                "notes": _text(entry.get("notes", ""), "notes", 10000),
                "resolved": resolved,
                "resolved_on": _date(entry.get("resolvedOn", ""), "resolvedOn", optional=True),
            }
        )

    for entry in payload["events"]:
        if not isinstance(entry, dict):
            raise ValidationError({"events": "Every event must be an object."})
        external_id = _text(entry.get("id", ""), "id", 64, required=True)
        if external_id in event_ids:
            raise ValidationError({"events": "Event IDs must be unique."})
        event_ids.add(external_id)
        animal_id = _text(entry.get("animalId", ""), "animalId", 64)
        if animal_id and animal_id not in animal_ids:
            raise ValidationError({"animalId": "Event refers to an unknown animal."})
        events.append(
            {
                "external_id": external_id,
                "animal_id": animal_id,
                "date": _date(entry.get("date"), "date"),
                "type": _choice(entry.get("type"), "type", FarmEvent.TYPES),
                "title": _text(entry.get("title", ""), "title", 200),
                "notes": _text(entry.get("notes", ""), "notes", 10000),
                "done": _bool(entry.get("done", False), "done"),
            }
        )
    return {"animals": animals, "events": events, "health": health}
