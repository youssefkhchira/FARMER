from django.contrib import admin

from .models import Animal, FarmEvent, FarmProfile, HealthRecord


admin.site.register(FarmProfile)
admin.site.register(Animal)
admin.site.register(HealthRecord)
admin.site.register(FarmEvent)
