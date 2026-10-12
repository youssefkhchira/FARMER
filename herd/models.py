from django.conf import settings
from django.db import models


class FarmProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="farm_profile"
    )
    farm_name = models.CharField(max_length=120)

    def __str__(self):
        return self.farm_name


class Animal(models.Model):
    SPECIES = [
        (value, value.title())
        for value in (
            "rabbit",
            "sheep",
            "horse",
            "goat",
            "cow",
            "camel",
            "donkey",
            "chicken",
            "other",
        )
    ]
    SEXES = [("female", "Female"), ("male", "Male")]
    STATUSES = [
        (value, value.title())
        for value in ("healthy", "ill", "pregnant", "sold", "deceased")
    ]

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    external_id = models.CharField(max_length=64)
    tag = models.CharField(max_length=40)
    species = models.CharField(max_length=16, choices=SPECIES)
    name = models.CharField(max_length=120, blank=True)
    sex = models.CharField(max_length=8, choices=SEXES)
    breed = models.CharField(max_length=120, blank=True)
    dob = models.DateField(null=True, blank=True)
    weight = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUSES)
    mother = models.CharField(max_length=40, blank=True)
    father = models.CharField(max_length=40, blank=True)
    notes = models.TextField(blank=True)
    created = models.DateField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("owner", "external_id"), name="unique_animal_external_id_per_owner"
            ),
            models.UniqueConstraint(fields=("owner", "tag"), name="unique_animal_tag_per_owner"),
        ]
        ordering = ("tag",)

    def __str__(self):
        return self.tag


class HealthRecord(models.Model):
    TYPES = [
        (value, value.title())
        for value in ("illness", "treatment", "vaccination", "checkup")
    ]

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    animal = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name="health_records")
    external_id = models.CharField(max_length=64)
    date = models.DateField()
    type = models.CharField(max_length=16, choices=TYPES)
    title = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    resolved = models.BooleanField(default=False)
    resolved_on = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("owner", "external_id"), name="unique_health_external_id_per_owner"
            )
        ]
        ordering = ("-date",)


class FarmEvent(models.Model):
    TYPES = [
        (value, value.title())
        for value in ("vaccination", "vet", "mating", "birth", "weighing", "sale", "other")
    ]

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    animal = models.ForeignKey(
        Animal, null=True, blank=True, on_delete=models.CASCADE, related_name="events"
    )
    external_id = models.CharField(max_length=64)
    date = models.DateField()
    type = models.CharField(max_length=16, choices=TYPES)
    title = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    done = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("owner", "external_id"), name="unique_event_external_id_per_owner"
            )
        ]
        ordering = ("date",)
