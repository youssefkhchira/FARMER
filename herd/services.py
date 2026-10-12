from django.db import transaction

from .models import Animal, FarmEvent, FarmProfile, HealthRecord


def profile_payload(user):
    profile, _created = FarmProfile.objects.get_or_create(
        user=user, defaults={"farm_name": ""}
    )
    return {
        "email": user.email,
        "name": user.first_name,
        "farm": profile.farm_name,
    }


def serialize_data(user):
    animals = list(Animal.objects.filter(owner=user))
    return {
        "animals": [
            {
                "id": animal.external_id,
                "created": animal.created.isoformat(),
                "tag": animal.tag,
                "species": animal.species,
                "name": animal.name,
                "sex": animal.sex,
                "breed": animal.breed,
                "dob": animal.dob.isoformat() if animal.dob else "",
                "weight": str(animal.weight) if animal.weight is not None else "",
                "status": animal.status,
                "mother": animal.mother,
                "father": animal.father,
                "notes": animal.notes,
            }
            for animal in animals
        ],
        "health": [
            {
                "id": record.external_id,
                "animalId": record.animal.external_id,
                "date": record.date.isoformat(),
                "type": record.type,
                "title": record.title,
                "notes": record.notes,
                "resolved": record.resolved,
                "resolvedOn": record.resolved_on.isoformat() if record.resolved_on else "",
            }
            for record in HealthRecord.objects.filter(owner=user).select_related("animal")
        ],
        "events": [
            {
                "id": event.external_id,
                "date": event.date.isoformat(),
                "type": event.type,
                "title": event.title,
                "animalId": event.animal.external_id if event.animal_id else "",
                "notes": event.notes,
                "done": event.done,
            }
            for event in FarmEvent.objects.filter(owner=user).select_related("animal")
        ],
    }


@transaction.atomic
def replace_data(user, data):
    animal_objects = [
        Animal(owner=user, **entry)
        for entry in data["animals"]
    ]
    Animal.objects.filter(owner=user).delete()
    Animal.objects.bulk_create(animal_objects)
    animals = {
        animal.external_id: animal
        for animal in Animal.objects.filter(owner=user)
    }
    health_objects = []
    for entry in data["health"]:
        record = entry.copy()
        animal = animals[record.pop("animal_id")]
        health_objects.append(HealthRecord(owner=user, animal=animal, **record))
    HealthRecord.objects.bulk_create(health_objects)

    event_objects = []
    for entry in data["events"]:
        event = entry.copy()
        animal_id = event.pop("animal_id")
        event_objects.append(
            FarmEvent(owner=user, animal=animals.get(animal_id), **event)
        )
    FarmEvent.objects.bulk_create(event_objects)
